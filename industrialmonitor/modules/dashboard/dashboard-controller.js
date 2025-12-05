// modules/dashboard/dashboard-controller.js
import stateStore from '../../state/store.js';
import { DashboardView } from './dashboard-view.js';
import { HistoricalDataService } from './historical-data-service.js';
import { RealtimeMonitor } from './realtime-monitor.js';
import { MotorCoordinator } from './motor-coordinator.js';

export class DashboardController {
    constructor() {
        this.view = null;
        this.historicalService = null;
        this.realtimeMonitor = null;
        this.motorCoordinator = null;
        
        this.isInitialized = false;
        this.unsubscribeCallbacks = [];
        
        // Bind methods
        this.handleHistoricalDataRequest = this.handleHistoricalDataRequest.bind(this);
        this.handleRefreshRequest = this.handleRefreshRequest.bind(this);
    }

    async initialize() {
        if (this.isInitialized) {
            console.warn('[DashboardController] Ya inicializado');
            return;
        }
        
        console.log('[DashboardController] Inicializando módulos del dashboard...');
        
        try {
            // 1. Inicializar servicios
            this.historicalService = new HistoricalDataService();
            this.realtimeMonitor = new RealtimeMonitor();
            this.motorCoordinator = new MotorCoordinator();
            
            // 2. Inicializar vista
            this.view = new DashboardView();
            await this.view.initialize();
            
            // 3. Configurar suscripciones al estado
            this.setupStateSubscriptions();
            
            // 4. Configurar event listeners
            this.setupEventListeners();
            
            // 5. Inicializar coordinador de motores
            await this.motorCoordinator.initialize();
            
            // 6. Cargar datos iniciales
            await this.loadInitialData();
            
            // 7. Iniciar monitoreo en tiempo real
            this.realtimeMonitor.start();
            
            this.isInitialized = true;
            console.log('[DashboardController] Inicialización completada');
            
            // Notificar que el dashboard está listo
            document.dispatchEvent(new CustomEvent('dashboard:ready'));
            
        } catch (error) {
            console.error('[DashboardController] Error durante la inicialización:', error);
            throw error;
        }
    }

    setupStateSubscriptions() {
        // Suscribirse a cambios en motores
        const unsubscribeMotors = stateStore.subscribe('motors', (motorsData) => {
            this.motorCoordinator.updateMotors(motorsData);
            this.view.updateMotorPanels(motorsData);
        });
        
        // Suscribirse a cambios en KPIs
        const unsubscribeKPIs = stateStore.subscribe('kpis', (kpisData) => {
            this.view.updateKPIDisplay(kpisData);
        });
        
        // Suscribirse a cambios en estado del sistema
        const unsubscribeSystem = stateStore.subscribe('systemStatus', (status) => {
            this.view.updateSystemStatus(status);
            this.updateConnectionDisplay(status);
        });
        
        // Suscribirse a alertas
        const unsubscribeAlerts = stateStore.subscribe('alerts', (alertsData) => {
            this.view.updateAlertsDisplay(alertsData);
        });
        
        // Suscribirse a conexión
        const unsubscribeConnection = stateStore.subscribe('connection', (connectionData) => {
            this.view.updateConnectionStatus(connectionData);
        });
        
        this.unsubscribeCallbacks.push(
            unsubscribeMotors, 
            unsubscribeKPIs, 
            unsubscribeSystem,
            unsubscribeAlerts,
            unsubscribeConnection
        );
    }

    setupEventListeners() {
        // Escuchar eventos de la vista
        document.addEventListener('dashboard:loadHistorical', this.handleHistoricalDataRequest);
        document.addEventListener('dashboard:refresh', this.handleRefreshRequest);
        
        // Escuchar eventos de sistema
        document.addEventListener('websocket:connected', () => {
            console.log('[DashboardController] WebSocket conectado');
            this.view.showNotification('Conexión en tiempo real establecida', 'success');
        });
        
        document.addEventListener('websocket:maxRetries', () => {
            console.log('[DashboardController] Fallo de conexión WebSocket');
            this.view.showNotification('Usando modo offline con datos simulados', 'warning');
        });
    }

    async handleHistoricalDataRequest(event) {
        const { variable, motor, timeRange } = event.detail;
        
        try {
            const historicalData = await this.historicalService.loadDataForChart(variable, motor, timeRange);
            this.view.renderTrendChart(historicalData);
        } catch (error) {
            console.error('[DashboardController] Error cargando datos históricos:', error);
            this.view.showNotification('Error cargando datos históricos', 'error');
            
            // Mostrar datos de fallback
            const fallbackData = this.historicalService.generateFallbackData(variable, motor);
            this.view.renderTrendChart(fallbackData);
        }
    }

    async handleRefreshRequest() {
        console.log('[DashboardController] Refresco manual solicitado');
        
        this.view.showLoadingIndicator(true);
        
        try {
            // Forzar recarga de datos
            await this.historicalService.clearCache();
            
            const currentState = stateStore.getState();
            const { chartVariable, chartMotor } = this.view.getChartSettings();
            
            // Recargar datos históricos
            const historicalData = await this.historicalService.loadDataForChart(
                chartVariable, 
                chartMotor, 
                '24h'
            );
            
            this.view.renderTrendChart(historicalData);
            this.view.showNotification('Datos actualizados correctamente', 'success');
            
        } catch (error) {
            console.error('[DashboardController] Error durante el refresco:', error);
            this.view.showNotification('Error actualizando datos', 'error');
        } finally {
            this.view.showLoadingIndicator(false);
        }
    }

    async loadInitialData() {
        console.log('[DashboardController] Cargando datos iniciales...');
        
        this.view.showLoadingIndicator(true);
        
        try {
            // Cargar datos históricos iniciales
            const chartSettings = this.view.getChartSettings();
            const historicalData = await this.historicalService.loadInitialHistoricalData(
                chartSettings.variable,
                chartSettings.motor
            );
            
            this.view.renderTrendChart(historicalData);
            
            // Sincronizar estado inicial
            const currentState = stateStore.getState();
            this.motorCoordinator.updateMotors(currentState.motors);
            this.view.updateKPIDisplay(currentState.kpis);
            this.view.updateSystemStatus(currentState.systemStatus);
            
            console.log('[DashboardController] Datos iniciales cargados');
            
        } catch (error) {
            console.error('[DashboardController] Error cargando datos iniciales:', error);
            this.view.showNotification('Usando datos de demostración', 'warning');
            
            // Cargar datos de fallback
            const fallbackData = this.historicalService.generateFallbackData();
            this.view.renderTrendChart(fallbackData);
            
        } finally {
            this.view.showLoadingIndicator(false);
        }
    }

    updateConnectionDisplay(status) {
        const connectionElement = document.getElementById('connection-display');
        if (!connectionElement) return;
        
        const statusConfig = {
            'connected': { text: 'Conectado', className: 'status-online', icon: 'wifi' },
            'connecting': { text: 'Conectando...', className: 'status-connecting', icon: 'sync' },
            'disconnected': { text: 'Desconectado', className: 'status-offline', icon: 'wifi-off' },
            'error': { text: 'Error de conexión', className: 'status-error', icon: 'exclamation-triangle' }
        };
        
        const config = statusConfig[status] || statusConfig.disconnected;
        
        connectionElement.className = `connection-status ${config.className}`;
        connectionElement.innerHTML = `<i class="fas fa-${config.icon}"></i> ${config.text}`;
    }

    destroy() {
        console.log('[DashboardController] Destruyendo dashboard...');
        
        // Limpiar suscripciones
        this.unsubscribeCallbacks.forEach(unsubscribe => unsubscribe());
        this.unsubscribeCallbacks = [];
        
        // Remover event listeners
        document.removeEventListener('dashboard:loadHistorical', this.handleHistoricalDataRequest);
        document.removeEventListener('dashboard:refresh', this.handleRefreshRequest);
        
        // Detener servicios
        if (this.realtimeMonitor) {
            this.realtimeMonitor.stop();
        }
        
        // Destruir vista
        if (this.view) {
            this.view.destroy();
        }
        
        // Destruir coordinador
        if (this.motorCoordinator) {
            this.motorCoordinator.destroy();
        }
        
        // Limpiar referencias
        this.view = null;
        this.historicalService = null;
        this.realtimeMonitor = null;
        this.motorCoordinator = null;
        this.isInitialized = false;
        
        console.log('[DashboardController] Destrucción completada');
    }

    // Métodos públicos para la app principal
    show() {
        if (this.view) {
            this.view.show();
        }
    }

    hide() {
        if (this.view) {
            this.view.hide();
        }
    }

    isReady() {
        return this.isInitialized;
    }
}

// Exportar instancia única
let dashboardInstance = null;

export function getDashboardController() {
    if (!dashboardInstance) {
        dashboardInstance = new DashboardController();
    }
    return dashboardInstance;
}