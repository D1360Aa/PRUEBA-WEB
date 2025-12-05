// state/store.js
class StateStore {
    constructor() {
        if (StateStore.instance) {
            return StateStore.instance;
        }
        StateStore.instance = this;
        
        // Estado inicial
        this.state = {
            motors: {
                motor1: { temperature: 0, oil_pressure: 0, clutch_pressure: 0, status: 'normal' },
                motor2: { temperature: 0, oil_pressure: 0, clutch_pressure: 0, status: 'normal' }
            },
            kpis: {
                efficiency: '0%',
                uptime: '100%',
                activeAlerts: 0
            },
            alerts: {
                active: [],
                history: []
            },
            systemStatus: 'connecting', // connecting, connected, disconnected, error
            connection: {
                mode: 'websocket', // websocket, polling, offline
                lastUpdate: null
            }
        };
        
        this.subscribers = new Map();
        this.eventListeners = new Map();
    }

    // Métodos de estado
    updateState(section, data) {
        if (!this.state[section]) {
            console.warn(`[StateStore] Sección "${section}" no existe en el estado`);
            return;
        }
        
        // Actualización profunda para objetos anidados
        if (typeof this.state[section] === 'object' && !Array.isArray(this.state[section])) {
            this.state[section] = { ...this.state[section], ...data };
        } else {
            this.state[section] = data;
        }
        
        this._notify(section, this.state[section]);
        
        // También emitir evento global para componentes que necesiten escuchar cambios específicos
        this._emitEvent(`${section}:updated`, this.state[section]);
    }

    // Métodos específicos para motores
    updateMotor(motorId, data) {
        if (!this.state.motors[motorId]) {
            console.warn(`[StateStore] Motor "${motorId}" no existe`);
            return;
        }
        
        this.state.motors[motorId] = { 
            ...this.state.motors[motorId], 
            ...data,
            lastUpdate: new Date().toISOString()
        };
        
        this._notify('motors', this.state.motors);
        this._emitEvent(`motor:${motorId}:updated`, this.state.motors[motorId]);
    }

    // Métodos para alertas
    addAlert(alert) {
        const newAlert = {
            ...alert,
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            resolved: false
        };
        
        // Agregar a alertas activas
        this.state.alerts.active.push(newAlert);
        
        // Agregar al historial (mantener solo las últimas 100)
        this.state.alerts.history.unshift(newAlert);
        if (this.state.alerts.history.length > 100) {
            this.state.alerts.history.pop();
        }
        
        // Actualizar KPIs
        this.state.kpis.activeAlerts = this.state.alerts.active.length;
        
        this._notify('alerts', this.state.alerts);
        this._notify('kpis', this.state.kpis);
        this._emitEvent('alert:added', newAlert);
    }

    resolveAlert(alertId) {
        const alertIndex = this.state.alerts.active.findIndex(a => a.id === alertId);
        if (alertIndex !== -1) {
            const alert = this.state.alerts.active[alertIndex];
            alert.resolved = true;
            alert.resolvedAt = new Date().toISOString();
            
            this.state.alerts.active.splice(alertIndex, 1);
            this.state.kpis.activeAlerts = this.state.alerts.active.length;
            
            this._notify('alerts', this.state.alerts);
            this._notify('kpis', this.state.kpis);
            this._emitEvent('alert:resolved', alert);
        }
    }

    // Sistema de suscripción
    subscribe(section, callback) {
        if (!this.subscribers.has(section)) {
            this.subscribers.set(section, []);
        }
        
        const callbacks = this.subscribers.get(section);
        callbacks.push(callback);
        
        // Retornar función para desuscribirse
        return () => {
            const index = callbacks.indexOf(callback);
            if (index > -1) callbacks.splice(index, 1);
        };
    }

    // Sistema de eventos
    on(eventName, callback) {
        if (!this.eventListeners.has(eventName)) {
            this.eventListeners.set(eventName, []);
        }
        
        this.eventListeners.get(eventName).push(callback);
        
        return () => {
            const listeners = this.eventListeners.get(eventName);
            const index = listeners.indexOf(callback);
            if (index > -1) listeners.splice(index, 1);
        };
    }

    _notify(section, data) {
        const callbacks = this.subscribers.get(section) || [];
        callbacks.forEach(cb => {
            try {
                cb(data);
            } catch (error) {
                console.error(`[StateStore] Error en callback de "${section}":`, error);
            }
        });
    }

    _emitEvent(eventName, data) {
        const listeners = this.eventListeners.get(eventName) || [];
        listeners.forEach(listener => {
            try {
                listener(data);
            } catch (error) {
                console.error(`[StateStore] Error en listener de "${eventName}":`, error);
            }
        });
    }

    // Getters
    getState() {
        return JSON.parse(JSON.stringify(this.state)); // Retorna copia profunda
    }

    getMotor(motorId) {
        return this.state.motors[motorId] ? { ...this.state.motors[motorId] } : null;
    }

    getActiveAlerts() {
        return [...this.state.alerts.active];
    }

    // Métodos de utilidad
    clearAlerts() {
        this.state.alerts.active = [];
        this.state.kpis.activeAlerts = 0;
        this._notify('alerts', this.state.alerts);
        this._notify('kpis', this.state.kpis);
    }

    reset() {
        this.state = {
            motors: {
                motor1: { temperature: 0, oil_pressure: 0, clutch_pressure: 0, status: 'normal' },
                motor2: { temperature: 0, oil_pressure: 0, clutch_pressure: 0, status: 'normal' }
            },
            kpis: {
                efficiency: '0%',
                uptime: '100%',
                activeAlerts: 0
            },
            alerts: {
                active: [],
                history: []
            },
            systemStatus: 'connecting',
            connection: {
                mode: 'websocket',
                lastUpdate: null
            }
        };
        
        // Notificar a todos los suscriptores
        this.subscribers.forEach((callbacks, section) => {
            callbacks.forEach(cb => cb(this.state[section]));
        });
    }
}

// Exportar instancia singleton
export default new StateStore();