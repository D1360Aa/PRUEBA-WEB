// services/websocket-service.js
import stateStore from '../state/store.js';
import { AlertManager } from '../modules/alerts/alert-manager.js';

export class WebSocketService {
    constructor(url) {
        this.url = url;
        this.socket = null;
        this.reconnectInterval = 3000;
        this.maxRetries = 10;
        this.currentRetries = 0;
        this.isManualClose = false;
        this.alertManager = new AlertManager();
        
        this.messageHandlers = {
            'telemetry_latest': this.handleTelemetryLatest.bind(this),
            'motor_status': this.handleMotorStatus.bind(this),
            'system_alert': this.handleSystemAlert.bind(this),
            'kpi_update': this.handleKpiUpdate.bind(this)
        };
    }

    connect() {
        if (this.isConnected()) {
            console.log('[WebSocketService] Ya conectado');
            return;
        }
        
        this.isManualClose = false;
        
        try {
            console.log(`[WebSocketService] Conectando a ${this.url}...`);
            this.socket = new WebSocket(this.url);
            
            this.setupEventHandlers();
            
        } catch (error) {
            console.error('[WebSocketService] Error al crear WebSocket:', error);
            this.scheduleReconnect();
        }
    }

    setupEventHandlers() {
        this.socket.onopen = () => {
            console.log('[WebSocketService] Conexión establecida');
            this.currentRetries = 0;
            
            // Actualizar estado del sistema
            stateStore.updateState('systemStatus', 'connected');
            stateStore.updateState('connection', { 
                mode: 'websocket', 
                lastUpdate: new Date().toISOString(),
                status: 'connected'
            });
            
            // Emitir evento global
            document.dispatchEvent(new CustomEvent('websocket:connected'));
        };

        this.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.processMessage(data);
                
                // Actualizar timestamp de última conexión
                stateStore.updateState('connection', { 
                    lastUpdate: new Date().toISOString() 
                });
                
            } catch (error) {
                console.error('[WebSocketService] Error procesando mensaje:', error);
            }
        };

        this.socket.onclose = (event) => {
            console.log(`[WebSocketService] Conexión cerrada. Código: ${event.code}, Razón: ${event.reason}`);
            
            stateStore.updateState('systemStatus', 'disconnected');
            stateStore.updateState('connection', { 
                status: 'disconnected',
                lastRetry: new Date().toISOString()
            });
            
            if (!this.isManualClose && this.currentRetries < this.maxRetries) {
                this.scheduleReconnect();
            } else if (!this.isManualClose) {
                console.error('[WebSocketService] Máximo de reintentos alcanzado');
                document.dispatchEvent(new CustomEvent('websocket:maxRetries'));
            }
        };

        this.socket.onerror = (error) => {
            console.error('[WebSocketService] Error de WebSocket:', error);
            stateStore.updateState('systemStatus', 'error');
        };
    }

    processMessage(data) {
        const { type, ...payload } = data;
        
        if (this.messageHandlers[type]) {
            this.messageHandlers[type](payload);
        } else {
            console.warn(`[WebSocketService] Tipo de mensaje no manejado: ${type}`);
        }
    }

    handleTelemetryLatest(payload) {
        const { data } = payload;
        
        if (!data) return;
        
        // Procesar datos de motores
        Object.keys(data).forEach(key => {
            if (key.includes('motor1')) {
                const variable = key.replace('_motor1', '');
                stateStore.updateMotor('motor1', { [variable]: data[key] });
            } else if (key.includes('motor2')) {
                const variable = key.replace('_motor2', '');
                stateStore.updateMotor('motor2', { [variable]: data[key] });
            }
        });
        
        // Verificar alertas
        this.checkForAlerts(data);
        
        // Actualizar timestamp
        stateStore.updateState('connection', { 
            lastUpdate: new Date().toISOString() 
        });
    }

    handleMotorStatus(payload) {
        const { motorId, status, data } = payload;
        
        if (motorId && status) {
            stateStore.updateMotor(motorId, { 
                status,
                ...data 
            });
        }
    }

    handleSystemAlert(payload) {
        const { severity, message, component } = payload;
        
        this.alertManager.addAlert({
            severity,
            message,
            component,
            type: 'system'
        });
    }

    handleKpiUpdate(payload) {
        const { kpis } = payload;
        
        if (kpis) {
            stateStore.updateState('kpis', kpis);
        }
    }

    checkForAlerts(data) {
        // Verificar umbrales para motor1
        const motor1Config = config.MOTORS.find(m => m.id === 'motor1');
        motor1Config.variables.forEach(v => {
            const value = data[`${v.key}_motor1`];
            if (value !== undefined) {
                this.checkThreshold('motor1', v, value);
            }
        });
        
        // Verificar umbrales para motor2
        const motor2Config = config.MOTORS.find(m => m.id === 'motor2');
        motor2Config.variables.forEach(v => {
            const value = data[`${v.key}_motor2`];
            if (value !== undefined) {
                this.checkThreshold('motor2', v, value);
            }
        });
    }

    checkThreshold(motorId, variable, value) {
        const motorName = motorId === 'motor1' ? 'Motor Principal' : 'Motor Secundario';
        
        // Verificar umbral crítico alto
        if (variable.critical !== undefined && value >= variable.critical) {
            this.alertManager.addAlert({
                severity: 'critical',
                message: `${motorName}: ${variable.name} CRÍTICA (${value}${variable.unit})`,
                component: motorId,
                variable: variable.key,
                value
            });
        }
        
        // Verificar umbral crítico bajo
        if (variable.criticalLow !== undefined && value <= variable.criticalLow) {
            this.alertManager.addAlert({
                severity: 'critical',
                message: `${motorName}: ${variable.name} CRÍTICAMENTE BAJA (${value}${variable.unit})`,
                component: motorId,
                variable: variable.key,
                value
            });
        }
        
        // Verificar umbral de advertencia
        if (value > variable.normalMax || value < variable.normalMin) {
            this.alertManager.addAlert({
                severity: 'warning',
                message: `${motorName}: ${variable.name} fuera de rango (${value}${variable.unit})`,
                component: motorId,
                variable: variable.key,
                value
            });
        }
    }

    scheduleReconnect() {
        if (this.currentRetries >= this.maxRetries) return;
        
        this.currentRetries++;
        const delay = this.reconnectInterval * Math.pow(1.5, this.currentRetries - 1);
        
        console.log(`[WebSocketService] Reintento ${this.currentRetries}/${this.maxRetries} en ${Math.round(delay/1000)}s`);
        
        setTimeout(() => {
            if (!this.isManualClose) {
                this.connect();
            }
        }, delay);
    }

    send(data) {
        if (this.isConnected()) {
            this.socket.send(JSON.stringify(data));
            return true;
        }
        
        console.warn('[WebSocketService] No se puede enviar, socket no conectado');
        return false;
    }

    disconnect() {
        this.isManualClose = true;
        
        if (this.socket) {
            this.socket.close(1000, 'Cierre manual');
            this.socket = null;
        }
    }

    isConnected() {
        return this.socket && this.socket.readyState === WebSocket.OPEN;
    }

    getStatus() {
        if (!this.socket) return 'disconnected';
        
        switch (this.socket.readyState) {
            case WebSocket.CONNECTING: return 'connecting';
            case WebSocket.OPEN: return 'connected';
            case WebSocket.CLOSING: return 'closing';
            case WebSocket.CLOSED: return 'disconnected';
            default: return 'unknown';
        }
    }
}