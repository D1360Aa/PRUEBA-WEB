// modules/dashboard/motor-coordinator.js
import stateStore from '../../state/store.js';

export class MotorCoordinator {
    constructor() {
        this.motorPanels = new Map(); // Map de motorId -> MotorPanel instance
        this.gauges = new Map(); // Map de motorId-variable -> Gauge instance
        this.lastUpdateTimes = new Map();
        this.updateQueue = [];
        this.isProcessingQueue = false;
        
        // Configuración de motores desde config
        this.motorConfigs = new Map();
        config.MOTORS.forEach(motor => {
            this.motorConfigs.set(motor.id, motor);
        });
    }

    async initialize() {
        console.log('[MotorCoordinator] Inicializando coordinador de motores...');
        
        try {
            // 1. Crear instancias de MotorPanel para cada motor
            await this.createMotorPanels();
            
            // 2. Configurar listeners para actualizaciones
            this.setupUpdateListeners();
            
            // 3. Inicializar con estado actual
            const currentState = stateStore.getState();
            this.updateMotors(currentState.motors);
            
            console.log('[MotorCoordinator] Inicialización completada');
            
        } catch (error) {
            console.error('[MotorCoordinator] Error durante la inicialización:', error);
            throw error;
        }
    }

    async createMotorPanels() {
        // Motor 1
        const motor1Config = this.motorConfigs.get('motor1');
        if (motor1Config) {
            const motor1Panel = new MotorPanel('motor1-container', 'motor1', motor1Config.name);
            await motor1Panel.initialize();
            this.motorPanels.set('motor1', motor1Panel);
            
            // Almacenar gauges para actualizaciones rápidas
            motor1Config.variables.forEach(v => {
                const gaugeKey = `motor1-${v.key}`;
                const gauge = motor1Panel.getGauge(v.key);
                if (gauge) {
                    this.gauges.set(gaugeKey, gauge);
                }
            });
        }
        
        // Motor 2
        const motor2Config = this.motorConfigs.get('motor2');
        if (motor2Config) {
            const motor2Panel = new MotorPanel('motor2-container', 'motor2', motor2Config.name);
            await motor2Panel.initialize();
            this.motorPanels.set('motor2', motor2Panel);
            
            // Almacenar gauges
            motor2Config.variables.forEach(v => {
                const gaugeKey = `motor2-${v.key}`;
                const gauge = motor2Panel.getGauge(v.key);
                if (gauge) {
                    this.gauges.set(gaugeKey, gauge);
                }
            });
        }
    }

    setupUpdateListeners() {
        // Escuchar eventos específicos de motor
        stateStore.on('motor:motor1:updated', (motorData) => {
            this.queueMotorUpdate('motor1', motorData);
        });
        
        stateStore.on('motor:motor2:updated', (motorData) => {
            this.queueMotorUpdate('motor2', motorData);
        });
        
        // Escuchar cambios de tema para redibujar gauges
        document.addEventListener('theme:changed', () => {
            this.redrawAllGauges();
        });
    }

    queueMotorUpdate(motorId, motorData) {
        // Agregar a la cola de actualizaciones
        this.updateQueue.push({ motorId, data: motorData });
        
        // Procesar cola si no está siendo procesada
        if (!this.isProcessingQueue) {
            this.processUpdateQueue();
        }
    }

    async processUpdateQueue() {
        if (this.isProcessingQueue || this.updateQueue.length === 0) {
            return;
        }
        
        this.isProcessingQueue = true;
        
        try {
            // Procesar hasta 10 actualizaciones por ciclo
            const batchSize = 10;
            const batch = this.updateQueue.splice(0, batchSize);
            
            // Usar requestAnimationFrame para actualizaciones suaves
            await new Promise(resolve => {
                requestAnimationFrame(() => {
                    batch.forEach(({ motorId, data }) => {
                        this.applyMotorUpdate(motorId, data);
                    });
                    resolve();
                });
            });
            
            // Si quedan más actualizaciones, procesar siguiente batch
            if (this.updateQueue.length > 0) {
                setTimeout(() => this.processUpdateQueue(), 0);
            }
            
        } catch (error) {
            console.error('[MotorCoordinator] Error procesando cola de actualizaciones:', error);
        } finally {
            this.isProcessingQueue = false;
        }
    }

    applyMotorUpdate(motorId, motorData) {
        const motorPanel = this.motorPanels.get(motorId);
        if (!motorPanel) {
            console.warn(`[MotorCoordinator] Panel no encontrado para motor ${motorId}`);
            return;
        }
        
        // Verificar si los datos han cambiado significativamente
        if (!this.hasSignificantChanges(motorId, motorData)) {
            return;
        }
        
        // Actualizar panel
        motorPanel.updateData(motorData);
        
        // Actualizar timestamp
        this.lastUpdateTimes.set(motorId, Date.now());
        
        // Actualizar gauges individualmente para mejor performance
        this.updateGauges(motorId, motorData);
        
        // Calcular y actualizar eficiencia
        this.updateMotorEfficiency(motorId, motorData);
    }

    hasSignificantChanges(motorId, newData) {
        const lastUpdate = this.lastUpdateTimes.get(motorId);
        if (!lastUpdate) return true; // Primera actualización
        
        // Solo actualizar si han pasado al menos 100ms desde la última actualización
        // Esto previene actualizaciones demasiado frecuentes
        if (Date.now() - lastUpdate < 100) {
            return false;
        }
        
        // Para variables críticas, siempre actualizar
        const criticalVariables = ['temperature', 'oil_pressure'];
        const hasCriticalChange = criticalVariables.some(variable => {
            const oldValue = this.getLastValue(motorId, variable);
            const newValue = newData[variable];
            
            if (oldValue === undefined || newValue === undefined) return true;
            
            // Considerar cambio significativo si difiere más del 1%
            const threshold = oldValue * 0.01;
            return Math.abs(newValue - oldValue) > threshold;
        });
        
        return hasCriticalChange;
    }

    getLastValue(motorId, variable) {
        const motorPanel = this.motorPanels.get(motorId);
        if (!motorPanel) return undefined;
        
        return motorPanel.getCurrentValue(variable);
    }

    updateGauges(motorId, motorData) {
        const motorConfig = this.motorConfigs.get(motorId);
        if (!motorConfig) return;
        
        motorConfig.variables.forEach(v => {
            const value = motorData[v.key];
            if (value !== undefined) {
                const gaugeKey = `${motorId}-${v.key}`;
                const gauge = this.gauges.get(gaugeKey);
                
                if (gauge) {
                    // Actualizar gauge con animación
                    gauge.setValue(value, true);
                    
                    // Verificar estado y cambiar color si es necesario
                    this.updateGaugeStatus(gauge, value, v);
                }
            }
        });
    }

    updateGaugeStatus(gauge, value, variableConfig) {
        // Determinar estado basado en umbrales
        let status = 'normal';
        
        if (variableConfig.critical !== undefined && value >= variableConfig.critical) {
            status = 'critical';
        } else if (variableConfig.criticalLow !== undefined && value <= variableConfig.criticalLow) {
            status = 'critical';
        } else if (value > variableConfig.normalMax || value < variableConfig.normalMin) {
            status = 'warning';
        }
        
        // Actualizar color del gauge según estado
        gauge.setStatus(status);
    }

    updateMotorEfficiency(motorId, motorData) {
        // Calcular eficiencia basada en temperatura
        // Temperatura óptima: 80°C, eficiencia decrece fuera de este rango
        const temp = motorData.temperature || 0;
        const optimalTemp = 80;
        const tempDiff = Math.abs(temp - optimalTemp);
        
        // Eficiencia base: 100% en temperatura óptima
        let efficiency = 100;
        
        // Reducir eficiencia basado en diferencia de temperatura
        if (tempDiff > 0) {
            efficiency -= tempDiff * 0.5; // 0.5% por grado de diferencia
        }
        
        // Asegurar que la eficiencia esté entre 0% y 100%
        efficiency = Math.max(0, Math.min(100, efficiency));
        
        // Actualizar en el panel
        const motorPanel = this.motorPanels.get(motorId);
        if (motorPanel) {
            motorPanel.updateEfficiency(efficiency.toFixed(1));
        }
        
        // También actualizar en el estado global (para KPIs)
        stateStore.updateState('kpis', {
            efficiency: `${efficiency.toFixed(1)}%`
        });
    }

    updateMotors(motorsData) {
        if (!motorsData) return;
        
        // Actualizar cada motor
        Object.keys(motorsData).forEach(motorId => {
            this.queueMotorUpdate(motorId, motorsData[motorId]);
        });
    }

    redrawAllGauges() {
        console.log('[MotorCoordinator] Redibujando todos los gauges');
        
        this.gauges.forEach(gauge => {
            if (gauge && typeof gauge.redraw === 'function') {
                gauge.redraw();
            }
        });
    }

    getMotorStatus(motorId) {
        const motorPanel = this.motorPanels.get(motorId);
        if (!motorPanel) return 'unknown';
        
        return motorPanel.getStatus();
    }

    getMotorData(motorId) {
        const motorPanel = this.motorPanels.get(motorId);
        if (!motorPanel) return null;
        
        return motorPanel.getCurrentData();
    }

    getAllMotorData() {
        const data = {};
        
        this.motorPanels.forEach((panel, motorId) => {
            data[motorId] = panel.getCurrentData();
        });
        
        return data;
    }

    destroy() {
        console.log('[MotorCoordinator] Destruyendo coordinador...');
        
        // Destruir todos los panels
        this.motorPanels.forEach(panel => {
            if (panel && typeof panel.destroy === 'function') {
                panel.destroy();
            }
        });
        
        // Limpiar maps
        this.motorPanels.clear();
        this.gauges.clear();
        this.lastUpdateTimes.clear();
        this.updateQueue = [];
        
        console.log('[MotorCoordinator] Destrucción completada');
    }
}

// MotorPanel simplificado para la nueva arquitectura
class MotorPanel {
    constructor(containerId, motorId, motorName) {
        this.containerId = containerId;
        this.motorId = motorId;
        this.motorName = motorName;
        this.container = null;
        this.gauges = new Map();
        this.currentData = {};
        this.efficiency = 0;
        this.status = 'normal';
    }

    async initialize() {
        this.container = document.getElementById(this.containerId);
        if (!this.container) {
            throw new Error(`Contenedor ${this.containerId} no encontrado`);
        }
        
        // Renderizar estructura inicial
        this.render();
        
        // Inicializar gauges
        await this.initializeGauges();
        
        console.log(`[MotorPanel] Panel ${this.motorId} inicializado`);
    }

    render() {
        const motorConfig = config.MOTORS.find(m => m.id === this.motorId);
        if (!motorConfig) return;
        
        this.container.innerHTML = `
            <div class="motor-header">
                <h3>${this.motorName}</h3>
                <span id="status-${this.motorId}" class="status status-ok">Estado: Normal</span>
            </div>
            <div id="gauges-${this.motorId}" class="gauges-container">
                <!-- Gauges serán insertados aquí por initializeGauges -->
            </div>
            <div id="data-panel-${this.motorId}" class="data-panel">
                <div class="data-item">
                    <label>Eficiencia</label>
                    <strong id="eff-${this.motorId}">0%</strong>
                </div>
                <div class="data-item">
                    <label>Última Actualización</label>
                    <strong id="update-${this.motorId}">--:--:--</strong>
                </div>
            </div>
        `;
    }

    async initializeGauges() {
        const motorConfig = config.MOTORS.find(m => m.id === this.motorId);
        if (!motorConfig) return;
        
        const gaugesContainer = document.getElementById(`gauges-${this.motorId}`);
        if (!gaugesContainer) return;
        
        // Crear un gauge para cada variable
        motorConfig.variables.forEach(v => {
            const canvas = document.createElement('canvas');
            canvas.id = `gauge-${this.motorId}-${v.key}`;
            
            const wrapper = document.createElement('div');
            wrapper.className = 'gauge-wrapper';
            wrapper.appendChild(canvas);
            gaugesContainer.appendChild(wrapper);
            
            // Crear instancia de Gauge
            const gauge = new Gauge(canvas, {
                title: v.name,
                unit: v.unit,
                minValue: v.min,
                maxValue: v.max,
                normalMin: v.normalMin,
                normalMax: v.normalMax,
                criticalLow: v.criticalLow,
                criticalHigh: v.criticalHigh
            });
            
            this.gauges.set(v.key, gauge);
        });
    }

    updateData(newData) {
        // Actualizar datos actuales
        this.currentData = { ...this.currentData, ...newData };
        
        // Actualizar timestamp de última actualización
        if (this.currentData.lastUpdate) {
            const updateElement = document.getElementById(`update-${this.motorId}`);
            if (updateElement) {
                const time = new Date(this.currentData.lastUpdate).toLocaleTimeString();
                updateElement.textContent = time;
            }
        }
        
        // Actualizar estado
        this.updateStatus();
    }

    updateStatus() {
        // Determinar estado basado en datos actuales
        let newStatus = 'normal';
        let statusClass = 'status-ok';
        
        const motorConfig = config.MOTORS.find(m => m.id === this.motorId);
        if (!motorConfig) return;
        
        // Verificar cada variable para determinar estado
        motorConfig.variables.forEach(v => {
            const value = this.currentData[v.key];
            if (value === undefined) return;
            
            if (v.critical !== undefined && value >= v.critical) {
                newStatus = 'error';
                statusClass = 'status-err';
            } else if (v.criticalLow !== undefined && value <= v.criticalLow) {
                newStatus = 'error';
                statusClass = 'status-err';
            } else if ((value > v.normalMax || value < v.normalMin) && newStatus === 'normal') {
                newStatus = 'warning';
                statusClass = 'status-warn';
            }
        });
        
        // Actualizar visualización de estado
        this.status = newStatus;
        const statusElement = document.getElementById(`status-${this.motorId}`);
        if (statusElement) {
            statusElement.textContent = `Estado: ${this.getStatusText(newStatus)}`;
            statusElement.className = `status ${statusClass}`;
        }
    }

    getStatusText(status) {
        const statusMap = {
            'normal': 'Normal',
            'warning': 'Advertencia',
            'error': 'Error',
            'offline': 'Desconectado'
        };
        return statusMap[status] || 'Desconocido';
    }

    updateEfficiency(efficiency) {
        this.efficiency = efficiency;
        
        const effElement = document.getElementById(`eff-${this.motorId}`);
        if (effElement) {
            effElement.textContent = `${efficiency}%`;
        }
    }

    getGauge(variable) {
        return this.gauges.get(variable);
    }

    getCurrentValue(variable) {
        return this.currentData[variable];
    }

    getCurrentData() {
        return { ...this.currentData, efficiency: this.efficiency, status: this.status };
    }

    getStatus() {
        return this.status;
    }

    destroy() {
        // Limpiar gauges
        this.gauges.forEach(gauge => {
            if (gauge && typeof gauge.destroy === 'function') {
                gauge.destroy();
            }
        });
        this.gauges.clear();
        
        // Limpiar contenedor
        if (this.container) {
            this.container.innerHTML = '';
        }
        
        this.container = null;
        this.currentData = {};
    }
}