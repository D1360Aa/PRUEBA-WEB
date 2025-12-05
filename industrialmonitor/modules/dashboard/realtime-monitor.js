// modules/dashboard/realtime-monitor.js
import stateStore from '../../state/store.js';

export class RealtimeMonitor {
    constructor() {
        this.wsService = null;
        this.pollingInterval = null;
        this.fallbackInterval = null;
        this.isPollingActive = false;
        this.pollingRetries = 0;
        this.maxPollingRetries = 3;
        
        this.connectionState = {
            mode: 'none', // websocket, polling, offline
            lastSuccess: null,
            errors: 0
        };
        
        this.metrics = {
            pollingAttempts: 0,
            pollingSuccess: 0,
            pollingErrors: 0,
            lastPollDuration: 0
        };
    }

    start() {
        console.log('[RealtimeMonitor] Iniciando monitoreo en tiempo real');
        
        // Inicialmente asumimos que WebSocket está manejado por el servicio principal
        this.connectionState.mode = 'websocket';
        this.connectionState.lastSuccess = new Date().toISOString();
        
        // Iniciar verificación periódica de conexión
        this.startConnectionMonitor();
        
        // Iniciar fallback polling
        this.startFallbackPolling();
        
        // Configurar listeners para eventos de conexión
        this.setupConnectionListeners();
    }

    setupConnectionListeners() {
        // Escuchar eventos de WebSocket
        document.addEventListener('websocket:connected', () => {
            console.log('[RealtimeMonitor] WebSocket conectado - desactivando polling');
            this.connectionState.mode = 'websocket';
            this.connectionState.lastSuccess = new Date().toISOString();
            this.connectionState.errors = 0;
            
            // Notificar al store
            stateStore.updateState('connection', {
                mode: 'websocket',
                status: 'connected',
                lastUpdate: new Date().toISOString()
            });
            
            // Pausar polling si está activo
            this.pausePolling();
        });
        
        document.addEventListener('websocket:disconnected', () => {
            console.log('[RealtimeMonitor] WebSocket desconectado - activando polling');
            this.connectionState.mode = 'polling';
            
            stateStore.updateState('connection', {
                mode: 'polling',
                status: 'disconnected',
                lastRetry: new Date().toISOString()
            });
            
            // Activar polling
            this.resumePolling();
        });
        
        document.addEventListener('websocket:maxRetries', () => {
            console.log('[RealtimeMonitor] WebSocket falló completamente - modo offline');
            this.connectionState.mode = 'offline';
            
            stateStore.updateState('connection', {
                mode: 'offline',
                status: 'failed',
                lastUpdate: new Date().toISOString()
            });
            
            // Usar datos simulados
            this.activateOfflineMode();
        });
    }

    startConnectionMonitor() {
        // Monitorear estado de conexión periódicamente
        setInterval(() => {
            this.checkConnectionHealth();
        }, 10000); // Cada 10 segundos
    }

    checkConnectionHealth() {
        const state = stateStore.getState();
        const now = new Date();
        const lastUpdate = new Date(state.connection.lastUpdate || 0);
        const secondsSinceLastUpdate = (now - lastUpdate) / 1000;
        
        // Si no hay actualizaciones en 30 segundos, considerar desconectado
        if (secondsSinceLastUpdate > 30 && this.connectionState.mode === 'websocket') {
            console.warn('[RealtimeMonitor] Sin actualizaciones recientes, verificando conexión...');
            
            // Cambiar a modo polling
            this.connectionState.mode = 'polling';
            stateStore.updateState('connection', {
                mode: 'polling',
                status: 'degraded'
            });
            
            // Activar polling
            this.resumePolling();
        }
    }

    startFallbackPolling() {
        // Polling como respaldo, pero inicialmente pausado
        this.pollingInterval = setInterval(() => {
            if (this.connectionState.mode === 'polling' && !this.isPollingActive) {
                this.executePollingCycle();
            }
        }, config.DATA_REFRESH_INTERVAL || 5000);
    }

    async executePollingCycle() {
        if (this.isPollingActive) {
            console.log('[RealtimeMonitor] Polling ya activo, omitiendo ciclo');
            return;
        }
        
        this.isPollingActive = true;
        this.metrics.pollingAttempts++;
        const startTime = Date.now();
        
        try {
            console.log('[RealtimeMonitor] Ejecutando ciclo de polling...');
            
            const token = window.auth?.token;
            if (!token) {
                throw new Error('Usuario no autenticado');
            }
            
            const response = await fetch(`${config.API_BASE_URL}/api/telemetry/latest`, {
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Cache-Control': 'no-cache'
                },
                signal: AbortSignal.timeout(10000) // Timeout de 10 segundos
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // Procesar datos exitosos
            this.processPollingData(data);
            
            // Actualizar métricas
            this.metrics.pollingSuccess++;
            this.metrics.lastPollDuration = Date.now() - startTime;
            this.pollingRetries = 0;
            
            // Actualizar estado
            this.connectionState.lastSuccess = new Date().toISOString();
            this.connectionState.errors = 0;
            
            stateStore.updateState('connection', {
                mode: 'polling',
                status: 'connected',
                lastUpdate: new Date().toISOString(),
                latency: this.metrics.lastPollDuration
            });
            
            console.log(`[RealtimeMonitor] Polling exitoso (${this.metrics.lastPollDuration}ms)`);
            
        } catch (error) {
            console.error('[RealtimeMonitor] Error en polling:', error);
            
            // Actualizar métricas
            this.metrics.pollingErrors++;
            this.connectionState.errors++;
            this.pollingRetries++;
            
            // Manejar error
            this.handlePollingError(error);
            
        } finally {
            this.isPollingActive = false;
        }
    }

    processPollingData(apiData) {
        if (!apiData) return;
        
        // Transformar datos de API al formato del store
        const transformedData = {};
        
        // Procesar motor 1
        const motor1Data = {};
        config.MOTORS[0].variables.forEach(v => {
            const key = `${v.key}_motor1`;
            if (apiData[key] !== undefined) {
                motor1Data[v.key] = apiData[key];
            }
        });
        
        if (Object.keys(motor1Data).length > 0) {
            transformedData.motor1 = {
                ...motor1Data,
                lastUpdate: new Date().toISOString(),
                status: 'normal'
            };
        }
        
        // Procesar motor 2
        const motor2Data = {};
        config.MOTORS[1].variables.forEach(v => {
            const key = `${v.key}_motor2`;
            if (apiData[key] !== undefined) {
                motor2Data[v.key] = apiData[key];
            }
        });
        
        if (Object.keys(motor2Data).length > 0) {
            transformedData.motor2 = {
                ...motor2Data,
                lastUpdate: new Date().toISOString(),
                status: 'normal'
            };
        }
        
        // Actualizar store
        if (Object.keys(transformedData).length > 0) {
            Object.keys(transformedData).forEach(motorId => {
                stateStore.updateMotor(motorId, transformedData[motorId]);
            });
        }
        
        // Verificar si hay timestamp general
        if (apiData.timestamp) {
            stateStore.updateState('connection', {
                lastUpdate: apiData.timestamp
            });
        }
    }

    handlePollingError(error) {
        console.error('[RealtimeMonitor] Error en polling:', error.message);
        
        // Actualizar estado de conexión
        stateStore.updateState('connection', {
            status: 'error',
            lastError: new Date().toISOString(),
            errorMessage: error.message
        });
        
        // Si hay demasiados errores consecutivos, activar modo offline
        if (this.pollingRetries >= this.maxPollingRetries) {
            console.warn('[RealtimeMonitor] Máximo de reintentos de polling alcanzado, activando modo offline');
            this.activateOfflineMode();
        }
    }

    activateOfflineMode() {
        this.connectionState.mode = 'offline';
        
        stateStore.updateState('connection', {
            mode: 'offline',
            status: 'offline',
            lastUpdate: new Date().toISOString()
        });
        
        // Usar datos simulados
        this.useSimulatedData();
        
        // Intentar recuperación periódica
        this.scheduleRecoveryAttempt();
    }

    useSimulatedData() {
        console.log('[RealtimeMonitor] Usando datos simulados');
        
        // Generar datos simulados para ambos motores
        const now = new Date();
        
        // Motor 1 simulado
        const motor1Data = {
            temperature: 65 + Math.random() * 55,
            oil_pressure: 30 + Math.random() * 35,
            clutch_pressure: 100 + Math.random() * 50,
            status: 'normal',
            lastUpdate: now.toISOString(),
            isSimulated: true
        };
        
        // Motor 2 simulado
        const motor2Data = {
            temperature: 60 + Math.random() * 60,
            oil_pressure: 25 + Math.random() * 45,
            clutch_pressure: 105 + Math.random() * 55,
            status: 'normal',
            lastUpdate: now.toISOString(),
            isSimulated: true
        };
        
        // Actualizar store
        stateStore.updateMotor('motor1', motor1Data);
        stateStore.updateMotor('motor2', motor2Data);
        
        // Notificar que estamos en modo simulado
        stateStore.updateState('systemStatus', 'warning');
    }

    scheduleRecoveryAttempt() {
        // Intentar recuperar conexión después de 30 segundos
        setTimeout(() => {
            if (this.connectionState.mode === 'offline') {
                console.log('[RealtimeMonitor] Intentando recuperar conexión...');
                this.connectionState.mode = 'polling';
                this.pollingRetries = 0;
                this.resumePolling();
            }
        }, 30000);
    }

    pausePolling() {
        console.log('[RealtimeMonitor] Polling pausado (WebSocket activo)');
        this.isPollingActive = false;
    }

    resumePolling() {
        console.log('[RealtimeMonitor] Polling reanudado');
        this.isPollingActive = false; // Permitir nuevo ciclo
    }

    stop() {
        console.log('[RealtimeMonitor] Deteniendo monitoreo...');
        
        // Limpiar intervals
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
        
        if (this.fallbackInterval) {
            clearInterval(this.fallbackInterval);
            this.fallbackInterval = null;
        }
        
        // Resetear estado
        this.isPollingActive = false;
        this.pollingRetries = 0;
        this.connectionState.mode = 'none';
        
        console.log('[RealtimeMonitor] Monitoreo detenido');
    }

    getMetrics() {
        return {
            ...this.metrics,
            connectionState: this.connectionState,
            isActive: this.isPollingActive,
            retries: this.pollingRetries
        };
    }

    getConnectionStatus() {
        return {
            mode: this.connectionState.mode,
            lastSuccess: this.connectionState.lastSuccess,
            errors: this.connectionState.errors,
            isPollingActive: this.isPollingActive
        };
    }
}