// components/MotorPanel.js - Componente MotorPanel optimizado
import { Gauge } from './Gauge.js';

export class MotorPanel {
    constructor(containerId, motorId, motorName) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.motorId = motorId;
        this.motorName = motorName;
        
        if (!this.container) {
            console.error(`[MotorPanel] Contenedor no encontrado: ${containerId}`);
            return;
        }
        
        // Configuración del motor
        this.motorConfig = config.MOTORS.find(m => m.id === motorId);
        if (!this.motorConfig) {
            console.error(`[MotorPanel] Configuración no encontrada para motor: ${motorId}`);
            return;
        }
        
        // Estado
        this.gauges = new Map();
        this.currentData = {};
        this.efficiency = 0;
        this.status = 'normal';
        this.lastUpdate = null;
        
        // Cache de elementos DOM
        this.domElements = {};
        
        // Flags
        this.isInitialized = false;
        this.isDestroyed = false;
        
        this.initialize();
    }

    async initialize() {
        if (this.isInitialized || this.isDestroyed) return;
        
        console.log(`[MotorPanel] Inicializando panel: ${this.motorName}`);
        
        try {
            // Renderizar estructura
            this.render();
            
            // Inicializar gauges
            await this.initializeGauges();
            
            // Configurar event listeners
            this.setupEventListeners();
            
            this.isInitialized = true;
            console.log(`[MotorPanel] Panel inicializado: ${this.motorName}`);
            
        } catch (error) {
            console.error(`[MotorPanel] Error inicializando panel ${this.motorName}:`, error);
        }
    }

    render() {
        if (this.isDestroyed) return;
        
        const motorConfig = this.motorConfig;
        
        this.container.innerHTML = `
            <div class="motor-header">
                <div class="motor-title">
                    <h3>
                        <i class="fas fa-cog"></i>
                        ${this.motorName}
                    </h3>
                    <div class="motor-meta">
                        <span class="motor-id">ID: ${this.motorId}</span>
                        <span class="motor-variables">${motorConfig.variables.length} variables</span>
                    </div>
                </div>
                <div class="motor-status">
                    <span id="status-${this.motorId}" class="status status-ok">
                        <i class="fas fa-check-circle"></i>
                        <span class="status-text">Normal</span>
                    </span>
                </div>
            </div>
            
            <div id="gauges-${this.motorId}" class="gauges-container">
                <!-- Gauges se insertarán aquí -->
            </div>
            
            <div id="data-panel-${this.motorId}" class="data-panel">
                <div class="data-row">
                    <div class="data-item">
                        <label>
                            <i class="fas fa-tachometer-alt"></i>
                            Eficiencia
                        </label>
                        <strong id="eff-${this.motorId}">0%</strong>
                    </div>
                    <div class="data-item">
                        <label>
                            <i class="fas fa-clock"></i>
                            Última Actualización
                        </label>
                        <strong id="update-${this.motorId}">--:--:--</strong>
                    </div>
                </div>
                <div class="data-row">
                    <div class="data-item">
                        <label>
                            <i class="fas fa-thermometer-half"></i>
                            Temperatura
                        </label>
                        <strong id="temp-${this.motorId}">0°C</strong>
                    </div>
                    <div class="data-item">
                        <label>
                            <i class="fas fa-tachometer-alt"></i>
                            Presión de Aceite
                        </label>
                        <strong id="oil-${this.motorId}">0 Psi</strong>
                    </div>
                </div>
            </div>
            
            <div class="motor-actions">
                <button class="btn-icon btn-small" title="Ver detalles">
                    <i class="fas fa-chart-line"></i>
                </button>
                <button class="btn-icon btn-small" title="Historial">
                    <i class="fas fa-history"></i>
                </button>
                <button class="btn-icon btn-small" title="Configurar">
                    <i class="fas fa-cog"></i>
                </button>
            </div>
        `;
        
        // Cachear elementos DOM importantes
        this.cacheDOMElements();
    }

    cacheDOMElements() {
        this.domElements = {
            status: document.getElementById(`status-${this.motorId}`),
            efficiency: document.getElementById(`eff-${this.motorId}`),
            lastUpdate: document.getElementById(`update-${this.motorId}`),
            temperature: document.getElementById(`temp-${this.motorId}`),
            oilPressure: document.getElementById(`oil-${this.motorId}`),
            gaugesContainer: document.getElementById(`gauges-${this.motorId}`)
        };
    }

    async initializeGauges() {
        if (this.isDestroyed || !this.domElements.gaugesContainer) return;
        
        const gaugesContainer = this.domElements.gaugesContainer;
        const motorConfig = this.motorConfig;
        
        // Limpiar contenedor
        gaugesContainer.innerHTML = '';
        
        // Crear gauge para cada variable
        const gaugePromises = motorConfig.variables.map(async (variable, index) => {
            // Crear wrapper
            const wrapper = document.createElement('div');
            wrapper.className = 'gauge-wrapper';
            wrapper.id = `gauge-wrapper-${this.motorId}-${variable.key}`;
            
            // Crear canvas
            const canvas = document.createElement('canvas');
            canvas.id = `gauge-${this.motorId}-${variable.key}`;
            wrapper.appendChild(canvas);
            
            // Agregar al contenedor
            gaugesContainer.appendChild(wrapper);
            
            // Crear instancia de Gauge
            try {
                const gauge = new Gauge(canvas, {
                    title: variable.name,
                    unit: variable.unit,
                    minValue: variable.min,
                    maxValue: variable.max,
                    normalMin: variable.normalMin,
                    normalMax: variable.normalMax,
                    criticalLow: variable.criticalLow,
                    criticalHigh: variable.criticalHigh || variable.critical,
                    animationDuration: 300,
                    showMinMax: true,
                    showValue: true,
                    showTitle: true
                });
                
                this.gauges.set(variable.key, gauge);
                
                // Valor inicial
                gauge.setValue(variable.min, false);
                
                return gauge;
                
            } catch (error) {
                console.error(`[MotorPanel] Error creando gauge ${variable.key}:`, error);
                return null;
            }
        });
        
        // Esperar a que todos los gauges se inicialicen
        await Promise.all(gaugePromises);
        
        console.log(`[MotorPanel] ${this.gauges.size} gauges inicializados para ${this.motorName}`);
    }

    setupEventListeners() {
        if (this.isDestroyed) return;
        
        // Event listeners para botones de acción
        const actionButtons = this.container.querySelectorAll('.motor-actions .btn-icon');
        actionButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleActionClick(e.currentTarget);
            });
        });
        
        // Escuchar cambios de tema
        document.addEventListener('theme:changed', () => {
            this.redrawGauges();
        });
    }

    handleActionClick(button) {
        const icon = button.querySelector('i').className;
        
        if (icon.includes('fa-chart-line')) {
            this.showDetails();
        } else if (icon.includes('fa-history')) {
            this.showHistory();
        } else if (icon.includes('fa-cog')) {
            this.showConfiguration();
        }
    }

    updateData(newData) {
        if (this.isDestroyed || !this.isInitialized) return;
        
        // Actualizar datos actuales
        this.currentData = { ...this.currentData, ...newData };
        this.lastUpdate = newData.lastUpdate || new Date().toISOString();
        
        // Actualizar visualización
        this.updateGauges();
        this.updateStatusDisplay();
        this.updateDataDisplay();
        this.updateEfficiency();
        
        // Actualizar timestamp
        this.updateTimestamp();
    }

    updateGauges() {
        this.motorConfig.variables.forEach(variable => {
            const value = this.currentData[variable.key];
            if (value !== undefined) {
                const gauge = this.gauges.get(variable.key);
                if (gauge) {
                    gauge.setValue(value, true);
                }
            }
        });
    }

    updateStatusDisplay() {
        if (!this.domElements.status) return;
        
        // Determinar estado basado en datos
        let newStatus = 'normal';
        let statusClass = 'status-ok';
        let statusIcon = 'fa-check-circle';
        let statusText = 'Normal';
        
        const motorConfig = this.motorConfig;
        
        // Verificar cada variable para determinar estado
        for (const variable of motorConfig.variables) {
            const value = this.currentData[variable.key];
            if (value === undefined) continue;
            
            // Verificar umbral crítico
            if (variable.critical !== undefined && value >= variable.critical) {
                newStatus = 'error';
                statusClass = 'status-err';
                statusIcon = 'fa-exclamation-circle';
                statusText = 'Crítico';
                break;
            }
            
            // Verificar umbral crítico bajo
            if (variable.criticalLow !== undefined && value <= variable.criticalLow) {
                newStatus = 'error';
                statusClass = 'status-err';
                statusIcon = 'fa-exclamation-circle';
                statusText = 'Crítico';
                break;
            }
            
            // Verificar umbral de advertencia
            if ((value > variable.normalMax || value < variable.normalMin) && newStatus === 'normal') {
                newStatus = 'warning';
                statusClass = 'status-warn';
                statusIcon = 'fa-exclamation-triangle';
                statusText = 'Advertencia';
            }
        }
        
        // Actualizar estado
        this.status = newStatus;
        
        // Actualizar visualización
        const statusElement = this.domElements.status;
        statusElement.className = `status ${statusClass}`;
        statusElement.innerHTML = `
            <i class="fas ${statusIcon}"></i>
            <span class="status-text">${statusText}</span>
        `;
    }

    updateDataDisplay() {
        if (!this.domElements.temperature || !this.domElements.oilPressure) return;
        
        // Actualizar valores específicos
        const temp = this.currentData.temperature;
        const oil = this.currentData.oil_pressure;
        
        if (temp !== undefined) {
            this.domElements.temperature.textContent = `${temp.toFixed(1)}°C`;
        }
        
        if (oil !== undefined) {
            this.domElements.oilPressure.textContent = `${oil.toFixed(1)} Psi`;
        }
    }

    updateEfficiency() {
        if (!this.domElements.efficiency) return;
        
        // Calcular eficiencia basada en temperatura
        // Temperatura óptima: 80°C, eficiencia decrece fuera de este rango
        const temp = this.currentData.temperature || 0;
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
        
        // Actualizar
        this.efficiency = efficiency;
        this.domElements.efficiency.textContent = `${efficiency.toFixed(1)}%`;
        
        // Cambiar color basado en eficiencia
        if (efficiency >= 90) {
            this.domElements.efficiency.style.color = 'var(--success-color)';
        } else if (efficiency >= 70) {
            this.domElements.efficiency.style.color = 'var(--warning-color)';
        } else {
            this.domElements.efficiency.style.color = 'var(--danger-color)';
        }
    }

    updateTimestamp() {
        if (!this.domElements.lastUpdate || !this.lastUpdate) return;
        
        const date = new Date(this.lastUpdate);
        const timeString = date.toLocaleTimeString('es-ES', { 
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit'
        });
        
        this.domElements.lastUpdate.textContent = timeString;
    }

    redrawGauges() {
        this.gauges.forEach(gauge => {
            if (gauge && typeof gauge.redraw === 'function') {
                gauge.redraw();
            }
        });
    }

    // Métodos de acción
    showDetails() {
        console.log(`[MotorPanel] Mostrando detalles para ${this.motorName}`);
        
        // Emitir evento para que el dashboard maneje la solicitud
        document.dispatchEvent(new CustomEvent('motorpanel:showDetails', {
            detail: {
                motorId: this.motorId,
                motorName: this.motorName,
                data: this.currentData
            }
        }));
    }

    showHistory() {
        console.log(`[MotorPanel] Mostrando historial para ${this.motorName}`);
        
        document.dispatchEvent(new CustomEvent('motorpanel:showHistory', {
            detail: {
                motorId: this.motorId,
                motorName: this.motorName
            }
        }));
    }

    showConfiguration() {
        console.log(`[MotorPanel] Mostrando configuración para ${this.motorName}`);
        
        document.dispatchEvent(new CustomEvent('motorpanel:showConfiguration', {
            detail: {
                motorId: this.motorId,
                motorName: this.motorName,
                config: this.motorConfig
            }
        }));
    }

    // Métodos de utilidad
    getGauge(variableKey) {
        return this.gauges.get(variableKey);
    }

    getCurrentValue(variableKey) {
        return this.currentData[variableKey];
    }

    getCurrentData() {
        return {
            ...this.currentData,
            efficiency: this.efficiency,
            status: this.status,
            lastUpdate: this.lastUpdate
        };
    }

    getStatus() {
        return this.status;
    }

    getEfficiency() {
        return this.efficiency;
    }

    destroy() {
        if (this.isDestroyed) return;
        
        console.log(`[MotorPanel] Destruyendo panel: ${this.motorName}`);
        
        // Destruir todos los gauges
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
        
        // Limpiar referencias
        this.container = null;
        this.domElements = {};
        this.currentData = {};
        this.isDestroyed = true;
        this.isInitialized = false;
    }

    // Método estático para creación fácil
    static create(containerId, motorId, motorName) {
        return new MotorPanel(containerId, motorId, motorName);
    }
}

// Exportar para uso global
if (typeof window !== 'undefined') {
    window.MotorPanel = MotorPanel;
}

export default MotorPanel;