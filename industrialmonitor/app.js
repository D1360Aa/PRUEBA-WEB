// app.js
import { WebSocketService } from './services/websocket-service.js';
import stateStore from './state/store.js';
import { getDashboardController } from './modules/dashboard/dashboard-controller.js';
import { initializeAlertSystem } from './modules/alerts/alert-manager.js';
import { initializeThemeManager } from './modules/ui/theme-manager.js';

class IndustrialMonitorApp {
    constructor() {
        this.wsService = null;
        this.dashboardController = null;
        this.currentPage = 'login';
        this.user = null;
        this.isInitialized = false;
        this.modules = new Map();
    }

    async init() {
        if (this.isInitialized) return;
        console.log('[IndustrialMonitorApp] Inicializando aplicación...');
        try {
            // 1. Verificar autenticación
            await this.checkAuth();

            // 2. Inicializar módulos según autenticación
            if (this.user) {
                await this.initializeAuthenticatedModules();
            }

            // 3. Configurar routing
            this.setupRouting();

            // 4. Configurar event listeners globales
            this.setupGlobalEvents();

            this.isInitialized = true;
            console.log('[IndustrialMonitorApp] Aplicación inicializada');

        } catch (error) {
            console.error('[IndustrialMonitorApp] Error durante la inicialización:', error);
            this.showErrorState(error);
        }
    }

    async checkAuth() {
        const auth = window.auth;
        if (!auth) {
            console.warn('[IndustrialMonitorApp] No hay objeto auth en window');
            this.showLoginUI();
            return;
        }

        try {
            if (auth.isAuthenticated() && !auth.isTokenExpired()) {
                this.user = auth.getCurrentUser();
                this.showAuthenticatedUI();
                return;
            }

            // Si no está autenticado, mostrar login
            this.showLoginUI();

            // Limpiar autenticación expirada
            if (auth.isTokenExpired && auth.isTokenExpired()) {
                if (typeof auth.logout === 'function') auth.logout();
            }
        } catch (err) {
            console.error('[IndustrialMonitorApp] Error verificando autenticación:', err);
            this.showLoginUI();
        }
    }

    async initializeAuthenticatedModules() {
        console.log('[IndustrialMonitorApp] Inicializando módulos autenticados...');

        // 1. Inicializar sistema de alertas
        const alertSystem = initializeAlertSystem();
        this.modules.set('alerts', alertSystem);

        // 2. Inicializar gestor de temas
        const themeManager = initializeThemeManager(this.user);
        this.modules.set('theme', themeManager);

        // 3. Inicializar servicio WebSocket
        try {
            this.wsService = new WebSocketService(config.WS_URL);
            if (typeof this.wsService.connect === 'function') {
                // si connect es async, await no dañará si devuelve undefined
                await this.wsService.connect();
            }
            this.modules.set('websocket', this.wsService);
        } catch (err) {
            console.error('[IndustrialMonitorApp] Error inicializando WebSocketService:', err);
        }

        // 4. Inicializar dashboard controller (pero no inicializar aún)
        this.dashboardController = getDashboardController();
        this.modules.set('dashboard', this.dashboardController);

        // 5. Configurar limpieza al cerrar
        this.setupCleanup();
    }

    showAuthenticatedUI() {
        const header = document.getElementById('app-header');
        const footer = document.getElementById('app-footer');
        const loginPage = document.getElementById('login-page');

        if (header) header.classList.remove('hidden');
        if (footer) footer.classList.remove('hidden');
        if (loginPage) loginPage.classList.add('hidden');

        // Actualizar información de usuario
        if (this.user) {
            const usernameElement = document.getElementById('current-username');
            const roleElement = document.getElementById('current-role');

            if (usernameElement) usernameElement.textContent = this.user.username || '';
            if (roleElement) {
                roleElement.textContent = (this.user.role === config.ROLES.SUPERVISOR)
                    ? 'Supervisor'
                    : 'Operador';
            }
        }
    }

    showLoginUI() {
        const header = document.getElementById('app-header');
        const footer = document.getElementById('app-footer');
        const loginPage = document.getElementById('login-page');

        if (header) header.classList.add('hidden');
        if (footer) footer.classList.add('hidden');
        if (loginPage) loginPage.classList.remove('hidden');
    }

    setupRouting() {
        // Configurar hash-based routing
        window.addEventListener('hashchange', () => {
            const hash = window.location.hash.substring(1);
            if (hash) {
                this.navigateTo(hash).catch(err => console.error(err));
            }
        });

        // Navegar a hash inicial o dashboard por defecto
        const initialHash = window.location.hash.substring(1) || 'dashboard';
        if (this.user) {
            // navegar sin duplicar la entrada al historial si ya estamos en ese hash
            this.navigateTo(initialHash).catch(err => console.error(err));
        } else {
            // Si no autenticado, asegurar que se muestre login
            if (!window.location.hash || window.location.hash === '#dashboard') {
                window.location.hash = '#login';
            }
        }
    }

    // app.js - Método navigateTo mejorado
    async navigateTo(targetPageId) {
        console.log(`[IndustrialMonitorApp] Navegando a: ${targetPageId}`);

        const allPages = document.querySelectorAll('.page');
        const targetPage = document.getElementById(`${targetPageId}-page`);
        const navItems = document.querySelectorAll('.nav-item');

        // 1. Validar autenticación
        if (targetPageId !== 'login' && !this.user) {
            console.warn('[IndustrialMonitorApp] Acceso denegado - no autenticado');
            window.location.hash = '#login';
            return;
        }

        // 2. Validar permisos de supervisor
        if (targetPage && targetPage.classList.contains('supervisor-only')) {
            if (this.user?.role !== config.ROLES.SUPERVISOR) {
                console.warn(`[IndustrialMonitorApp] Acceso denegado a ${targetPageId} - se requiere supervisor`);
                window.location.hash = '#dashboard';
                return;
            }
        }

        // 3. Si ya estamos en esta página, no hacer nada
        if (targetPage && targetPage.classList.contains('active')) {
            console.log(`[IndustrialMonitorApp] Ya en la página ${targetPageId}`);
            return;
        }

        // 4. Transición de páginas optimizada
        if (targetPage) {
            // Desactivar todas las páginas actuales
            allPages.forEach(page => {
                if (page.classList.contains('active')) {
                    // Transición de salida
                    page.style.transition = 'opacity 0.2s ease-out, visibility 0.2s ease-out';
                    page.classList.remove('active');

                    // Después de la transición, ocultar completamente
                    setTimeout(() => {
                        page.style.display = 'none';
                        page.style.transition = '';
                    }, 200);
                }
            });

            // Remover estado activo de navegación
            navItems.forEach(item => item.classList.remove('active'));

            // Preparar y mostrar página objetivo
            targetPage.style.display = 'block';
            targetPage.style.opacity = '0';
            targetPage.style.visibility = 'hidden';

            // Forzar reflow para que la transición funcione
            // eslint-disable-next-line no-unused-expressions
            targetPage.offsetHeight;

            // Transición de entrada
            requestAnimationFrame(() => {
                targetPage.style.transition = 'opacity 0.3s ease-out, visibility 0.3s ease-out';
                targetPage.classList.add('active');
                targetPage.style.opacity = '1';
                targetPage.style.visibility = 'visible';

                // Restaurar transición después de la animación
                setTimeout(() => {
                    targetPage.style.transition = '';
                }, 300);
            });

            // Actualizar navegación activa (busca enlaces nav con href)
            const activeNavItem = document.querySelector(`.nav-item[href="#${targetPageId}"], .nav-item[data-target="${targetPageId}"]`);
            if (activeNavItem) {
                activeNavItem.classList.add('active');
            }

            // 5. Inicializar módulos específicos de la página
            await this.initializePageModules(targetPageId);

        } else {
            console.error(`[IndustrialMonitorApp] Página no encontrada: ${targetPageId}`);
            window.location.hash = '#dashboard';
        }
    }

    async initializePageModules(pageId) {
        switch (pageId) {
            case 'dashboard':
                await this.initializeDashboard();
                break;

            case 'alerts':
                await this.initializeAlertsPage();
                break;

            case 'analysis':
            case 'reports':
            case 'config':
                console.log(`[IndustrialMonitorApp] Página ${pageId} - módulos de supervisor`);
                // Los módulos de supervisor se inicializan bajo demanda
                break;

            case 'login':
                // Login no requiere módulos adicionales
                break;

            default:
                // nada
                break;
        }
    }

    async initializeDashboard() {
        if (!this.dashboardController) {
            console.error('[IndustrialMonitorApp] Dashboard controller no disponible');
            return;
        }

        // Solo inicializar si no está ya inicializado
        if (!this.dashboardController.isReady || !this.dashboardController.isReady()) {
            console.log('[IndustrialMonitorApp] Inicializando dashboard...');

            try {
                if (typeof this.dashboardController.initialize === 'function') {
                    await this.dashboardController.initialize();
                }
                console.log('[IndustrialMonitorApp] Dashboard inicializado');

                // Mostrar dashboard si existe el método show
                if (typeof this.dashboardController.show === 'function') {
                    this.dashboardController.show();
                }

            } catch (error) {
                console.error('[IndustrialMonitorApp] Error inicializando dashboard:', error);
                this.showNotification('Error inicializando dashboard', 'error');
            }
        } else {
            // Dashboard ya está inicializado, solo mostrar
            if (typeof this.dashboardController.show === 'function') {
                this.dashboardController.show();
            }
        }
    }

    async initializeAlertsPage() {
        const alertSystem = this.modules.get('alerts');
        if (alertSystem && typeof alertSystem.renderHistory === 'function') {
            alertSystem.renderHistory();
        }
    }

    setupGlobalEvents() {
        // Evento de login exitoso
        document.addEventListener('auth:loginSuccess', async (event) => {
            try {
                this.user = event.detail.user;
                await this.initializeAuthenticatedModules();
                await this.navigateTo('dashboard');
            } catch (err) {
                console.error('[IndustrialMonitorApp] Error en auth:loginSuccess handler:', err);
            }
        });

        // Evento de logout
        document.addEventListener('auth:logout', () => {
            this.cleanup();
            this.user = null;
            this.navigateTo('login').catch(err => console.error(err));
        });

        // Manejar cierre de ventana/refresco
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    }

    setupCleanup() {
        // Configurar limpieza automática
        window.addEventListener('unload', () => this.cleanup());
        window.addEventListener('pagehide', () => this.cleanup());
    }

    cleanup() {
        console.log('[IndustrialMonitorApp] Limpiando recursos...');

        // Desconectar WebSocket
        if (this.wsService && typeof this.wsService.disconnect === 'function') {
            try { this.wsService.disconnect(); } catch (err) { console.warn(err); }
        }

        // Destruir dashboard
        if (this.dashboardController && typeof this.dashboardController.destroy === 'function') {
            try { this.dashboardController.destroy(); } catch (err) { console.warn(err); }
        }

        // Limpiar otros módulos
        this.modules.forEach((module) => {
            if (module && typeof module.destroy === 'function') {
                try { module.destroy(); } catch (err) { console.warn(err); }
            }
        });
        this.modules.clear();

        // Resetear store
        if (stateStore && typeof stateStore.reset === 'function') {
            stateStore.reset();
        }

        console.log('[IndustrialMonitorApp] Limpieza completada');
    }

    showErrorState(error) {
        console.error('[IndustrialMonitorApp] Estado de error:', error);
        const errorContainer = document.getElementById('app-error');
        if (errorContainer) {
            const message = (error && error.message) ? error.message : 'Error desconocido';
            errorContainer.innerHTML = `
                <div class="error-overlay">
                    <h3><i class="fas fa-exclamation-triangle"></i> Error del Sistema</h3>
                    <p>${message}</p>
                    <button id="error-retry" class="btn-primary">
                        <i class="fas fa-redo"></i> Reintentar
                    </button>
                </div>
            `;
            errorContainer.style.display = 'block';

            const retryBtn = document.getElementById('error-retry');
            if (retryBtn) {
                retryBtn.addEventListener('click', () => location.reload());
            }
        }
    }

    showNotification(message, type = 'info') {
        // Crear notificación global
        const notification = document.createElement('div');
        notification.className = `global-notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${this.getNotificationIcon(type)}"></i>
            <span>${message}</span>
            <button class="notification-close"><i class="fas fa-times"></i></button>
        `;

        document.body.appendChild(notification);

        // Animación de entrada
        // permitir una pequeña demora para que el DOM inserte el elemento
        setTimeout(() => notification.classList.add('show'), 10);

        // Configurar cierre
        const closeBtn = notification.querySelector('.notification-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                notification.classList.remove('show');
                setTimeout(() => {
                    if (notification.parentNode) notification.parentNode.removeChild(notification);
                }, 300);
            });
        }

        // Auto-remover después de 5 segundos
        setTimeout(() => {
            if (notification.parentNode && notification.classList.contains('show')) {
                notification.classList.remove('show');
                setTimeout(() => {
                    if (notification.parentNode) notification.parentNode.removeChild(notification);
                }, 300);
            }
        }, 5000);
    }

    getNotificationIcon(type) {
        const icons = {
            'success': 'check-circle',
            'error': 'exclamation-circle',
            'warning': 'exclamation-triangle',
            'info': 'info-circle'
        };
        return icons[type] || 'info-circle';
    }
}

// Instancia global de la aplicación
const app = new IndustrialMonitorApp();

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    app.init().catch(error => {
        console.error('Error crítico al inicializar la aplicación:', error);
    });
});

// Exportar para acceso global (si es necesario)
if (typeof window !== 'undefined') {
    window.app = app;
}
