// modules/dashboard/dashboard-view.js
export class DashboardView {
    constructor() {
        this.chartVariable = 'temperature';
        this.chartMotor = 'm1';
        this.trendChartInstance = null;
        this.isVisible = false;

        // Cache de elementos DOM para mejor performance
        this.domCache = {};
        // Siempre almacenamos objetos { parent, handler } para facilidad en destroy()
        this.eventHandlers = new Map();

        // Configuración de debounce
        this.chartUpdateTimeout = null;
        this.CHART_UPDATE_DELAY = 300; // ms
    }

    async initialize() {
        console.log('[DashboardView] Inicializando vista...');

        try {
            // 1. Cachear elementos DOM críticos
            this.cacheDOMElements();

            // 2. Inicializar gráfico de tendencias
            await this.initializeTrendChart();

            // 3. Configurar event listeners
            this.setupEventListeners();

            // 4. Renderizar estado inicial
            this.renderInitialState();

            console.log('[DashboardView] Vista inicializada');

        } catch (error) {
            console.error('[DashboardView] Error durante la inicialización:', error);
            throw error;
        }
    }

    cacheDOMElements() {
        // Elementos críticos para performance
        this.domCache = {
            // Controles
            refreshBtn: document.getElementById('refresh-data'),
            chartVariable: document.getElementById('chart-variable'),
            chartMotor: document.getElementById('chart-motor'),
            applyFilterBtn: document.getElementById('apply-filter-btn'),

            // Display
            lastUpdate: document.getElementById('last-update'),
            systemStatus: document.getElementById('system-status'),
            alertsContainer: document.getElementById('alerts-container'),
            alertsCount: document.getElementById('active-alerts-count'),

            // KPIs
            globalEfficiency: document.getElementById('global-efficiency'),
            systemUptime: document.getElementById('system-uptime'),

            // Motor panels
            motor1Container: document.getElementById('motor1-container'),
            motor2Container: document.getElementById('motor2-container')
        };
    }

    async initializeTrendChart() {
        // Inicializar gráfico de tendencias si existe la función global
        if (typeof window.initTrendChart === 'function') {
            try {
                this.trendChartInstance = window.initTrendChart();

                if (this.trendChartInstance && typeof this.trendChartInstance.setData === 'function') {
                    // Configurar gráfico vacío inicial
                    this.trendChartInstance.setData([], []);
                }
            } catch (err) {
                console.warn('[DashboardView] initTrendChart falló al inicializar:', err);
                this.trendChartInstance = null;
            }
        } else {
            console.warn('[DashboardView] Función initTrendChart no disponible');
        }
    }

    setupEventListeners() {
        // Usar delegación de eventos para mejor performance
        const dashboardElement = document.getElementById('dashboard-page');
        if (dashboardElement) {
            // Refresh button (delegado por id dentro del dashboard)
            this.addEventListener(dashboardElement, 'click', '#refresh-data', (e) => {
                e.preventDefault();
                this.onRefreshData();
            });

            // Apply filter button (delegado)
            this.addEventListener(dashboardElement, 'click', '#apply-filter-btn', (e) => {
                e.preventDefault();
                this.onApplyFilter();
            });

            // Chart controls (delegado)
            this.addEventListener(dashboardElement, 'change', '#chart-variable', (e) => {
                this.chartVariable = e.target.value;
                this.requestChartUpdate();
            });

            this.addEventListener(dashboardElement, 'change', '#chart-motor', (e) => {
                this.chartMotor = e.target.value;
                this.requestChartUpdate();
            });
        }

        // Listeners directos (si existen elementos fuera de la delegación)
        if (this.domCache.refreshBtn) {
            // Añadimos un listener directo pero lo almacenamos en el mismo formato para destroy()
            const directHandler = (e) => {
                e.preventDefault();
                this.onRefreshData();
            };
            this.domCache.refreshBtn.addEventListener('click', directHandler);
            this.eventHandlers.set('click-refreshBtn', { parent: this.domCache.refreshBtn, handler: directHandler });
        }
    }

    /**
     * Añade un listener con delegación opcional.
     * - parent: elemento en el que se añade el listener
     * - event: tipo de evento (string)
     * - selector: selector CSS para delegación. Si es falsy, se trata como listener directo.
     * - handler: función original (e) => {}
     */
    addEventListener(parent, event, selector, handler) {
        if (!parent || !event || typeof handler !== 'function') return;

        const wrappedHandler = (e) => {
            try {
                if (!selector) {
                    // Listener directo
                    handler(e);
                } else {
                    // Delegación: match en target o ancestor
                    if (e.target && (e.target.matches(selector) || e.target.closest(selector))) {
                        handler(e);
                    }
                }
            } catch (err) {
                console.error('[DashboardView] Error en wrappedHandler:', err);
            }
        };

        parent.addEventListener(event, wrappedHandler);

        const key = `${event}-${selector || '__direct__'}`;
        this.eventHandlers.set(key, { parent, handler: wrappedHandler });
    }

    requestChartUpdate() {
        // Debounce para evitar múltiples actualizaciones rápidas
        if (this.chartUpdateTimeout) {
            clearTimeout(this.chartUpdateTimeout);
        }

        this.chartUpdateTimeout = setTimeout(() => {
            this.loadHistoricalData();
        }, this.CHART_UPDATE_DELAY);
    }

    async loadHistoricalData() {
        // Emitir evento para que el controller maneje la solicitud
        document.dispatchEvent(new CustomEvent('dashboard:loadHistorical', {
            detail: {
                variable: this.chartVariable,
                motor: this.chartMotor,
                timeRange: '24h'
            }
        }));
    }

    renderTrendChart(data) {
        if (!this.trendChartInstance || !data) return;

        // Usar requestAnimationFrame para animaciones suaves
        requestAnimationFrame(() => {
            try {
                this.trendChartInstance.setData(data.datasets, data.labels);
            } catch (error) {
                console.error('[DashboardView] Error renderizando gráfico:', error);
            }
        });
    }

    updateMotorPanels(motorsData) {
        if (!motorsData) return;

        // Actualizar solo los paneles que han cambiado
        Object.keys(motorsData).forEach(motorId => {
            this.updateMotorPanel(motorId, motorsData[motorId]);
        });
    }

    updateMotorPanel(motorId, motorData) {
        // Esta función será llamada por el MotorCoordinator
        // La lógica específica del panel de motor está en motor-coordinator.js
        console.log(`[DashboardView] Actualizando panel ${motorId}:`, motorData);

        // Actualizar timestamp de última actualización
        if (this.domCache.lastUpdate && motorData && motorData.lastUpdate) {
            try {
                const time = new Date(motorData.lastUpdate).toLocaleTimeString();
                this.domCache.lastUpdate.textContent = `Última actualización: ${time}`;
            } catch (err) {
                console.warn('[DashboardView] Fecha inválida en motorData.lastUpdate:', err);
            }
        }
    }

    updateKPIDisplay(kpisData) {
        if (!kpisData || !this.domCache.globalEfficiency) return;

        // Actualizar eficiencia global
        if (kpisData.efficiency !== undefined && this.domCache.globalEfficiency.textContent !== String(kpisData.efficiency)) {
            this.domCache.globalEfficiency.textContent = kpisData.efficiency;
        }

        // Actualizar uptime
        if (kpisData.uptime !== undefined && this.domCache.systemUptime) {
            this.domCache.systemUptime.textContent = kpisData.uptime;
        }

        // Actualizar contador de alertas
        if (kpisData.activeAlerts !== undefined && this.domCache.alertsCount) {
            const count = Number(kpisData.activeAlerts) || 0;
            this.domCache.alertsCount.textContent = count;

            // Actualizar clases CSS según severidad
            this.domCache.alertsCount.classList.remove('critical', 'warning', 'normal');

            if (count > 5) {
                this.domCache.alertsCount.classList.add('critical');
            } else if (count > 0) {
                this.domCache.alertsCount.classList.add('warning');
            } else {
                this.domCache.alertsCount.classList.add('normal');
            }
        }
    }

    updateSystemStatus(status) {
        if (!this.domCache.systemStatus) return;

        const statusElement = this.domCache.systemStatus.querySelector('span');
        if (!statusElement) return;

        // Remover clases anteriores
        statusElement.classList.remove('status-normal', 'status-alert', 'status-error', 'status-warning');

        // Añadir clase y texto según estado
        let statusClass, statusText;

        switch (status) {
            case 'connected':
                statusClass = 'status-normal';
                statusText = 'Normal';
                break;
            case 'disconnected':
                statusClass = 'status-error';
                statusText = 'Error de Conexión';
                break;
            case 'connecting':
                statusClass = 'status-warning';
                statusText = 'Conectando...';
                break;
            case 'error':
                statusClass = 'status-error';
                statusText = 'Error Crítico';
                break;
            default:
                statusClass = 'status-normal';
                statusText = 'Normal';
        }

        statusElement.classList.add(statusClass);
        statusElement.textContent = statusText;
    }

    updateAlertsDisplay(alertsData) {
        if (!this.domCache.alertsContainer) return;

        // Asegurar estructura básica
        const active = (alertsData && Array.isArray(alertsData.active)) ? alertsData.active : [];

        if (active.length === 0) {
            this.domCache.alertsContainer.innerHTML = '<p class="no-alerts">No hay alertas activas</p>';
            return;
        }

        // Renderizar alertas activas
        const alertsHTML = active.map(alert => this.renderAlertItem(alert)).join('');
        this.domCache.alertsContainer.innerHTML = alertsHTML;
    }

    renderAlertItem(alert) {
        const iconMap = {
            'critical': 'exclamation-circle',
            'warning': 'exclamation-triangle',
            'info': 'info-circle',
            'normal': 'check-circle'
        };

        const icon = iconMap[alert?.severity] || 'info-circle';
        const timestamp = alert?.timestamp ? new Date(alert.timestamp) : null;
        const time = timestamp && !isNaN(timestamp) ? timestamp.toLocaleTimeString() : '--:--:--';
        const component = alert?.component || 'Sistema';
        const variable = alert?.variable || 'General';
        const message = alert?.message || '';

        return `
            <div class="alert-item ${alert?.severity || 'info'}">
                <div class="alert-content">
                    <i class="fas fa-${icon}"></i>
                    <div>
                        <strong>${component} - ${variable}</strong>
                        <p>${message}</p>
                        <small class="alert-time">${time}</small>
                    </div>
                </div>
            </div>
        `;
    }

    updateConnectionStatus(connectionData) {
        // Actualizar indicador de conexión en el header
        const connectionElement = document.getElementById('connection-status');
        if (!connectionElement || !connectionData) return;

        let statusClass, statusText, iconClass;

        switch (connectionData.mode) {
            case 'websocket':
                if (connectionData.status === 'connected') {
                    statusClass = 'status-online';
                    statusText = 'Streaming Activo';
                    iconClass = 'fas fa-bolt';
                } else {
                    statusClass = 'status-offline';
                    statusText = 'WebSocket Desconectado';
                    iconClass = 'fas fa-plug';
                }
                break;

            case 'polling':
                statusClass = 'status-warning';
                statusText = 'Polling Activo';
                iconClass = 'fas fa-sync-alt';
                break;

            case 'offline':
                statusClass = 'status-offline';
                statusText = 'Modo Offline';
                iconClass = 'fas fa-wifi-slash';
                break;

            default:
                statusClass = 'status-offline';
                statusText = 'Sin Conexión';
                iconClass = 'fas fa-circle';
        }

        connectionElement.className = `status-bar-item ${statusClass}`;
        connectionElement.innerHTML = `<i class="${iconClass}"></i> ${statusText}`;
    }

    onRefreshData() {
        document.dispatchEvent(new CustomEvent('dashboard:refresh'));
    }

    onApplyFilter() {
        const severity = document.getElementById('filter-severity')?.value || null;
        const motor = document.getElementById('filter-motor')?.value || null;

        console.log(`[DashboardView] Aplicando filtros: severidad=${severity}, motor=${motor}`);

        // Emitir evento para que el AlertManager maneje el filtrado
        document.dispatchEvent(new CustomEvent('alerts:filter', {
            detail: { severity, motor }
        }));
    }

    getChartSettings() {
        return {
            variable: this.chartVariable,
            motor: this.chartMotor
        };
    }

    showNotification(message, type = 'info') {
        // Crear notificación toast
        const toast = document.createElement('div');
        toast.className = `notification notification-${type}`;
        toast.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;

        document.body.appendChild(toast);

        // Animación de entrada
        setTimeout(() => toast.classList.add('show'), 10);

        // Remover después de 3 segundos
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }

    showLoadingIndicator(show) {
        const loader = document.getElementById('dashboard-loader') || this.createLoader();
        loader.style.display = show ? 'flex' : 'none';
    }

    createLoader() {
        const loader = document.createElement('div');
        loader.id = 'dashboard-loader';
        loader.className = 'dashboard-loader';
        loader.innerHTML = '<div class="loader-spinner"></div><p>Cargando datos...</p>';
        loader.style.display = 'none';

        document.getElementById('dashboard-page')?.appendChild(loader);
        return loader;
    }

    renderInitialState() {
        // Mostrar estado inicial
        this.updateSystemStatus('connecting');
        this.updateKPIDisplay({
            efficiency: '0%',
            uptime: '100%',
            activeAlerts: 0
        });

        // Actualizar timestamp
        if (this.domCache.lastUpdate) {
            this.domCache.lastUpdate.textContent = 'Última actualización: --:--:--';
        }
    }

    // Métodos mejorados show/hide con transiciones y cierre de otras páginas
    show() {
        if (this.isVisible) return;

        this.isVisible = true;
        const dashboardPage = document.getElementById('dashboard-page');

        if (dashboardPage) {
            // Ocultar cualquier otra página activa primero
            document.querySelectorAll('.page.active').forEach(page => {
                if (page.id !== 'dashboard-page') {
                    page.classList.remove('active');
                    page.style.display = 'none';
                }
            });

            // Mostrar dashboard con transición
            dashboardPage.style.display = 'block';
            dashboardPage.style.opacity = '0';

            // Forzar reflow
            // eslint-disable-next-line no-unused-expressions
            dashboardPage.offsetHeight;

            // Animar entrada
            requestAnimationFrame(() => {
                dashboardPage.style.transition = 'opacity 0.3s ease-out';
                dashboardPage.classList.add('active');
                dashboardPage.style.opacity = '1';

                // Limpiar transición después de la animación
                setTimeout(() => {
                    dashboardPage.style.transition = '';
                }, 300);
            });
        }
    }

    hide() {
        if (!this.isVisible) return;

        this.isVisible = false;
        const dashboardPage = document.getElementById('dashboard-page');

        if (dashboardPage && dashboardPage.classList.contains('active')) {
            // Animar salida
            dashboardPage.style.transition = 'opacity 0.2s ease-out';
            dashboardPage.style.opacity = '0';

            // Ocultar después de la animación
            setTimeout(() => {
                dashboardPage.classList.remove('active');
                dashboardPage.style.display = 'none';
                dashboardPage.style.transition = '';
                dashboardPage.style.opacity = '';
            }, 200);
        }
    }

    destroy() {
        console.log('[DashboardView] Destruyendo vista...');

        // Limpiar timeouts
        if (this.chartUpdateTimeout) {
            clearTimeout(this.chartUpdateTimeout);
            this.chartUpdateTimeout = null;
        }

        // Remover event listeners de forma segura
        this.eventHandlers.forEach((entry, key) => {
            try {
                if (!entry) return;
                const { parent, handler } = entry;
                if (parent && typeof handler === 'function') {
                    // extraer nombre del evento del key (formato event-selector o event-__direct__)
                    const event = key.split('-')[0];
                    parent.removeEventListener(event, handler);
                }
            } catch (err) {
                console.warn('[DashboardView] Error removiendo listener:', err);
            }
        });
        this.eventHandlers.clear();

        // Limpiar cache DOM
        this.domCache = {};

        // Limpiar gráfico
        if (this.trendChartInstance && typeof this.trendChartInstance.destroy === 'function') {
            try { this.trendChartInstance.destroy(); } catch (err) { /* ignore */ }
        }
        this.trendChartInstance = null;

        console.log('[DashboardView] Vista destruida');
    }
}
