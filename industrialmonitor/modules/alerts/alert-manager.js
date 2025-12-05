// modules/alerts/alert-manager.js
import stateStore from '../../state/store.js';

export class AlertManager {
    constructor() {
        this.activeAlerts = new Map(); // Map de alertKey -> alert
        this.alertHistory = [];
        this.maxHistory = 100;
        this.lastCheckedValues = new Map();
        this.filters = {
            severity: 'all',
            motor: 'all',
            resolved: false
        };
        
        this.initialize();
    }

    initialize() {
        console.log('[AlertManager] Inicializando gestor de alertas');
        
        // Cargar historial de demo si no hay datos
        if (this.alertHistory.length === 0) {
            this.loadDemoHistory();
        }
        
        // Configurar event listeners
        this.setupEventListeners();
        
        // Suscribirse al store
        this.setupStoreSubscriptions();
    }

    setupEventListeners() {
        // Filtros de alertas
        document.addEventListener('alerts:filter', (event) => {
            this.filters = { ...this.filters, ...event.detail };
            this.renderFilteredAlerts();
        });
        
        // Resolución de alertas
        document.addEventListener('alerts:resolve', (event) => {
            this.resolveAlert(event.detail.alertId, event.detail.resolvedBy);
        });
        
        // Limpieza de alertas
        document.addEventListener('alerts:clear', () => {
            this.clearResolvedAlerts();
        });
    }

    setupStoreSubscriptions() {
        // Suscribirse a actualizaciones de motores para verificar alertas
        stateStore.subscribe('motors', (motorsData) => {
            this.checkMotorAlerts(motorsData);
        });
    }

    checkMotorAlerts(motorsData) {
        if (!motorsData) return;
        
        Object.keys(motorsData).forEach(motorId => {
            const motorData = motorsData[motorId];
            const motorConfig = config.MOTORS.find(m => m.id === motorId);
            
            if (!motorConfig || !motorData) return;
            
            // Verificar cada variable
            motorConfig.variables.forEach(variable => {
                const value = motorData[variable.key];
                if (value !== undefined) {
                    this.checkThreshold(motorId, variable, value);
                }
            });
        });
    }

    checkThreshold(motorId, variable, value) {
        const motorName = motorId === 'motor1' ? 'Motor Principal' : 'Motor Secundario';
        const alertKey = `${motorId}-${variable.key}`;
        const lastValue = this.lastCheckedValues.get(alertKey);
        
        // Evitar alertas repetitivas por fluctuaciones menores
        if (lastValue !== undefined && Math.abs(value - lastValue) < (variable.normalMax * 0.02)) {
            return;
        }
        
        this.lastCheckedValues.set(alertKey, value);
        
        // Verificar umbrales
        let severity = 'normal';
        let message = '';
        
        // Umbral crítico alto
        if (variable.critical !== undefined && value >= variable.critical) {
            severity = 'critical';
            message = `${motorName}: ${variable.name} CRÍTICA (${value.toFixed(1)}${variable.unit})`;
        }
        // Umbral crítico bajo
        else if (variable.criticalLow !== undefined && value <= variable.criticalLow) {
            severity = 'critical';
            message = `${motorName}: ${variable.name} CRÍTICAMENTE BAJA (${value.toFixed(1)}${variable.unit})`;
        }
        // Umbral de advertencia alta
        else if (value > variable.normalMax) {
            severity = 'warning';
            message = `${motorName}: ${variable.name} ALTA (${value.toFixed(1)}${variable.unit})`;
        }
        // Umbral de advertencia baja
        else if (value < variable.normalMin) {
            severity = 'warning';
            message = `${motorName}: ${variable.name} BAJA (${value.toFixed(1)}${variable.unit})`;
        }
        
        // Manejar alerta si hay severidad
        if (severity !== 'normal' && message) {
            this.handleAlert({
                key: alertKey,
                motor: motorName,
                motorId,
                variable: variable.name,
                variableKey: variable.key,
                value: value.toFixed(1),
                unit: variable.unit,
                severity,
                message,
                timestamp: new Date().toISOString()
            });
        } else if (this.activeAlerts.has(alertKey)) {
            // Si vuelve a la normalidad, resolver alerta
            this.resolveAlertByKey(alertKey);
        }
    }

    handleAlert(alertData) {
        const existingAlert = this.activeAlerts.get(alertData.key);
        
        if (existingAlert) {
            // Actualizar alerta existente
            existingAlert.value = alertData.value;
            existingAlert.severity = alertData.severity;
            existingAlert.message = alertData.message;
            existingAlert.timestamp = alertData.timestamp;
            existingAlert.updateCount = (existingAlert.updateCount || 0) + 1;
        } else {
            // Crear nueva alerta
            const newAlert = {
                id: crypto.randomUUID(),
                ...alertData,
                updateCount: 1,
                resolved: false
            };
            
            this.activeAlerts.set(alertData.key, newAlert);
            
            // Agregar al historial
            this.alertHistory.unshift({ ...newAlert });
            if (this.alertHistory.length > this.maxHistory) {
                this.alertHistory.pop();
            }
            
            // Actualizar store
            stateStore.addAlert(newAlert);
            
            // Notificar visualmente si es crítica
            if (newAlert.severity === 'critical') {
                this.showCriticalAlertNotification(newAlert);
            }
            
            console.log(`[AlertManager] Nueva alerta: ${newAlert.message}`);
        }
        
        // Renderizar alertas activas
        this.renderActiveAlerts();
    }

    resolveAlertByKey(alertKey) {
        const alert = this.activeAlerts.get(alertKey);
        if (!alert) return;
        
        this.activeAlerts.delete(alertKey);
        
        // Marcar como resuelta en el historial
        const historyAlert = this.alertHistory.find(a => a.key === alertKey);
        if (historyAlert) {
            historyAlert.resolved = true;
            historyAlert.resolvedAt = new Date().toISOString();
        }
        
        // Actualizar store
        stateStore.resolveAlert(alert.id);
        
        console.log(`[AlertManager] Alerta resuelta: ${alert.message}`);
    }

    resolveAlert(alertId, resolvedBy = 'system') {
        const alert = [...this.activeAlerts.values()].find(a => a.id === alertId);
        if (!alert) return;
        
        this.resolveAlertByKey(alert.key);
        
        // Registrar resolución manual
        if (resolvedBy !== 'system') {
            console.log(`[AlertManager] Alerta ${alertId} resuelta por ${resolvedBy}`);
        }
    }

    renderActiveAlerts() {
        const container = document.getElementById('alerts-container');
        const countElement = document.getElementById('active-alerts-count');
        
        if (!container || !countElement) return;
        
        const alerts = Array.from(this.activeAlerts.values());
        
        if (alerts.length === 0) {
            container.innerHTML = '<p class="no-alerts">No hay alertas activas</p>';
            countElement.textContent = '0';
            countElement.className = 'alert-badge';
            return;
        }
        
        // Determinar severidad máxima
        const maxSeverity = alerts.reduce((max, alert) => {
            const severityRank = { 'critical': 3, 'warning': 2, 'info': 1, 'normal': 0 };
            return severityRank[alert.severity] > severityRank[max] ? alert.severity : max;
        }, 'normal');
        
        // Actualizar contador
        countElement.textContent = alerts.length.toString();
        countElement.className = `alert-badge alert-${maxSeverity}`;
        
        // Renderizar alertas
        container.innerHTML = alerts.map(alert => this.renderAlertItem(alert)).join('');
    }

    renderFilteredAlerts() {
        const listElement = document.getElementById('full-alerts-list');
        if (!listElement) return;
        
        const filteredAlerts = this.alertHistory.filter(alert => {
            let matches = true;
            
            if (this.filters.severity !== 'all') {
                matches = matches && alert.severity === this.filters.severity;
            }
            
            if (this.filters.motor !== 'all') {
                matches = matches && alert.motorId === this.filters.motor;
            }
            
            if (!this.filters.resolved) {
                matches = matches && !alert.resolved;
            }
            
            return matches;
        });
        
        if (filteredAlerts.length === 0) {
            listElement.innerHTML = '<p class="no-alerts">No se encontraron alertas con los filtros seleccionados.</p>';
            return;
        }
        
        const isSupervisor = window.auth?.getCurrentUser()?.role === config.ROLES.SUPERVISOR;
        
        listElement.innerHTML = filteredAlerts.map(alert => `
            <div class="history-alert-item" data-alert-id="${alert.id}">
                <span class="severity-tag ${alert.severity}">${alert.severity}</span>
                <div class="message">
                    <strong>${alert.motor} / ${alert.variable}:</strong> 
                    ${alert.message}
                    <small>(${new Date(alert.timestamp).toLocaleString()})</small>
                </div>
                <div>
                    ${alert.resolved ? 
                        '<span class="status-ok">Resuelta</span>' : 
                        '<span class="status-err">Pendiente</span>'}
                </div>
                ${isSupervisor && !alert.resolved ? 
                    `<button class="btn-primary resolve-btn" data-id="${alert.id}">Resolver</button>` : ''}
            </div>
        `).join('');
        
        // Agregar event listeners a botones de resolución
        if (isSupervisor) {
            listElement.querySelectorAll('.resolve-btn').forEach(button => {
                button.addEventListener('click', (e) => {
                    const alertId = e.target.dataset.id;
                    document.dispatchEvent(new CustomEvent('alerts:resolve', {
                        detail: { 
                            alertId, 
                            resolvedBy: window.auth.getCurrentUser().username 
                        }
                    }));
                });
            });
        }
    }

    renderAlertItem(alert) {
        const iconMap = {
            'critical': 'exclamation-circle',
            'warning': 'exclamation-triangle',
            'info': 'info-circle'
        };
        
        const icon = iconMap[alert.severity] || 'info-circle';
        const time = new Date(alert.timestamp).toLocaleTimeString();
        
        return `
            <div class="alert-item ${alert.severity}">
                <div class="alert-content">
                    <i class="fas fa-${icon}"></i>
                    <div>
                        <strong>${alert.motor} - ${alert.variable}</strong>
                        <p>${alert.message}</p>
                        <small class="alert-time">${time}</small>
                    </div>
                </div>
            </div>
        `;
    }

    showCriticalAlertNotification(alert) {
        // Crear notificación crítica
        const notification = document.createElement('div');
        notification.className = 'critical-alert-notification';
        notification.innerHTML = `
            <div class="critical-alert-content">
                <i class="fas fa-exclamation-triangle"></i>
                <div>
                    <h4>¡ALERTA CRÍTICA!</h4>
                    <p>${alert.message}</p>
                    <small>${new Date(alert.timestamp).toLocaleTimeString()}</small>
                </div>
                <button class="notification-dismiss">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Animación de entrada
        setTimeout(() => notification.classList.add('show'), 10);
        
        // Sonido de alerta (si está permitido)
        this.playAlertSound();
        
        // Configurar cierre
        notification.querySelector('.notification-dismiss').addEventListener('click', () => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        });
        
        // Auto-remover después de 10 segundos
        setTimeout(() => {
            if (notification.parentNode && notification.classList.contains('show')) {
                notification.classList.remove('show');
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }
        }, 10000);
    }

    playAlertSound() {
        // Solo reproducir si el usuario está interactuando con la página
        if (document.visibilityState === 'visible') {
            try {
                // Crear audio context para sonido de alerta
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                oscillator.frequency.value = 800;
                oscillator.type = 'sine';
                
                gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
                
                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.5);
                
            } catch (error) {
                console.warn('[AlertManager] No se pudo reproducir sonido de alerta:', error);
            }
        }
    }

    loadDemoHistory() {
        // Alertas de demostración para historial inicial
        const demoAlerts = [
            {
                id: 'demo-1',
                key: 'motor1-temperature-demo',
                motor: 'Motor Principal',
                motorId: 'motor1',
                variable: 'Temperatura',
                variableKey: 'temperature',
                value: '105.5',
                unit: '°C',
                severity: 'critical',
                message: 'Motor Principal: Temperatura CRÍTICA (105.5°C)',
                timestamp: new Date(Date.now() - 3600000).toISOString(),
                resolved: true,
                resolvedAt: new Date(Date.now() - 3500000).toISOString()
            },
            {
                id: 'demo-2',
                key: 'motor2-oil_pressure-demo',
                motor: 'Motor Secundario',
                motorId: 'motor2',
                variable: 'Presión de Aceite',
                variableKey: 'oil_pressure',
                value: '28.3',
                unit: 'Psi',
                severity: 'warning',
                message: 'Motor Secundario: Presión de Aceite BAJA (28.3Psi)',
                timestamp: new Date(Date.now() - 7200000).toISOString(),
                resolved: false
            }
        ];
        
        this.alertHistory.push(...demoAlerts);
    }

    clearResolvedAlerts() {
        this.alertHistory = this.alertHistory.filter(alert => !alert.resolved);
        console.log('[AlertManager] Alertas resueltas limpiadas del historial');
    }

    getStats() {
        return {
            active: this.activeAlerts.size,
            totalHistory: this.alertHistory.length,
            resolved: this.alertHistory.filter(a => a.resolved).length,
            bySeverity: {
                critical: this.alertHistory.filter(a => a.severity === 'critical').length,
                warning: this.alertHistory.filter(a => a.severity === 'warning').length,
                info: this.alertHistory.filter(a => a.severity === 'info').length
            }
        };
    }

    destroy() {
        console.log('[AlertManager] Destruyendo gestor de alertas');
        
        // Limpiar alertas activas
        this.activeAlerts.clear();
        this.alertHistory = [];
        this.lastCheckedValues.clear();
        
        console.log('[AlertManager] Destrucción completada');
    }
}

// Función de inicialización para la app principal
export function initializeAlertSystem() {
    const alertManager = new AlertManager();
    
    // Hacer disponible globalmente (opcional, para compatibilidad)
    if (typeof window !== 'undefined') {
        window.alertManager = alertManager;
    }
    
    return alertManager;
}