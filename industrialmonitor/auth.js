// auth.js - Sistema de Autenticación Modular
import stateStore from './state/store.js';

class AuthSystem {
    constructor() {
        // Cargar datos de autenticación desde localStorage
        this.token = localStorage.getItem('iot_token');
        this.user = JSON.parse(localStorage.getItem('iot_user') || 'null');
        this.currentTheme = localStorage.getItem('iot_theme') || config.THEMES.OPERATOR;
        this.apiBaseUrl = config.API_BASE_URL;
        this.isInitialized = false;

        // Credenciales de demostración para fallback
        this.DEMO_USERS = {
            'operador': { 
                role: config.ROLES.OPERATOR, 
                password: 'op123', 
                id: 'op_1',
                name: 'Operador Demo',
                permissions: ['view_dashboard', 'view_alerts']
            },
            'supervisor': { 
                role: config.ROLES.SUPERVISOR, 
                password: 'sup123', 
                id: 'sup_1',
                name: 'Supervisor Demo',
                permissions: ['view_dashboard', 'view_alerts', 'manage_users', 'configure_system']
            }
        };
    }

    /**
     * Inicializa el sistema de autenticación
     */
    async initialize() {
        if (this.isInitialized) return;
        
        console.log('[AuthSystem] Inicializando...');
        
        // Configurar event listeners
        this.setupEventListeners();
        
        // Aplicar tema guardado
        this.applyTheme();
        
        // Verificar autenticación automáticamente
        await this.checkCurrentAuth();
        
        this.isInitialized = true;
        console.log('[AuthSystem] Inicialización completada');
    }

    setupEventListeners() {
        // Evento de login
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleLoginSubmit();
            });
        }
        
        // Evento de logout
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logout());
        }
        
        // Evento de cambio de tema
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }
    }

    async handleLoginSubmit() {
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        const errorElement = document.getElementById('login-error');
        
        // Resetear error
        errorElement.classList.add('hidden');
        errorElement.textContent = '';
        
        // Validación básica
        if (!username || !password) {
            this.showLoginError('Por favor, completa todos los campos', errorElement);
            return;
        }
        
        // Mostrar loading
        const submitBtn = document.querySelector('#login-form button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Autenticando...';
        submitBtn.disabled = true;
        
        try {
            // Intentar login
            const result = await this.login(username, password);
            
            if (result.success) {
                // Login exitoso - emitir evento
                document.dispatchEvent(new CustomEvent('auth:loginSuccess', {
                    detail: { 
                        user: this.user,
                        token: this.token 
                    }
                }));
                
                // Resetear formulario
                document.getElementById('login-form').reset();
                
            } else {
                // Error de login
                this.showLoginError(result.error || 'Error de autenticación', errorElement);
            }
            
        } catch (error) {
            console.error('[AuthSystem] Error en login:', error);
            this.showLoginError('Error interno del sistema', errorElement);
            
        } finally {
            // Restaurar botón
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    }

    showLoginError(message, errorElement) {
        errorElement.textContent = message;
        errorElement.classList.remove('hidden');
        
        // Animación de error
        errorElement.style.animation = 'none';
        setTimeout(() => {
            errorElement.style.animation = 'shake 0.5s ease-in-out';
        }, 10);
        
        // Sonido de error (opcional)
        this.playErrorSound();
    }

    /**
     * Intenta autenticar al usuario contra el backend o usa credenciales demo.
     */
    async login(username, password) {
        console.log(`[AuthSystem] Intentando login para usuario: ${username}`);
        
        // 1. Intentar con el backend FastAPI
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/auth/login`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ 
                    username, 
                    password,
                    device: 'web_dashboard'
                }),
                signal: AbortSignal.timeout(10000) // Timeout de 10 segundos
            });

            if (response.ok) {
                const data = await response.json();
                
                // Suponiendo que el backend devuelve { access_token, user: { id, username, role } }
                this.token = data.access_token;
                this.user = {
                    id: data.user.id,
                    username: data.user.username,
                    role: data.user.role,
                    name: data.user.name || username,
                    permissions: data.user.permissions || []
                };
                
                // Guardar en localStorage
                this.saveAuthData();
                
                // Actualizar UI
                this.updateAuthenticatedUI();
                
                // Actualizar store
                stateStore.updateState('systemStatus', 'connected');
                
                console.log(`[AuthSystem] Login exitoso: ${username} (${this.user.role})`);
                return { success: true };
            } else {
                // Si el backend responde con error, probar demo
                console.warn(`[AuthSystem] Backend respondió con error ${response.status}`);
            }
            
        } catch (e) {
            console.warn(`[AuthSystem] Falló la conexión al backend. Error: ${e.message}`);
        }

        // 2. Fallback: Usar credenciales de demostración
        const demoUser = this.DEMO_USERS[username.toLowerCase()];
        if (demoUser && demoUser.password === password) {
            // Simular un token (simplificado para demo)
            this.user = { 
                id: demoUser.id, 
                username, 
                role: demoUser.role,
                name: demoUser.name,
                permissions: demoUser.permissions
            };
            this.token = `DEMO_TOKEN_${username}_${Date.now()}`;
            
            // Guardar datos
            this.saveAuthData();
            
            // Actualizar UI
            this.updateAuthenticatedUI();
            
            // Actualizar store
            stateStore.updateState('systemStatus', 'connected');
            
            console.log(`[AuthSystem] Login demo exitoso: ${username} (${this.user.role})`);
            return { success: true };
        }

        return { 
            success: false, 
            error: 'Credenciales inválidas o backend fuera de línea' 
        };
    }

    /**
     * Verifica la autenticación actual y actualiza el estado
     */
    async checkCurrentAuth() {
        if (this.isAuthenticated()) {
            if (this.isTokenExpired()) {
                console.log('[AuthSystem] Token expirado, cerrando sesión');
                this.logout();
                return;
            }
            
            // Actualizar UI
            this.updateAuthenticatedUI();
            
            // Emitir evento de autenticación existente
            document.dispatchEvent(new CustomEvent('auth:alreadyAuthenticated', {
                detail: { user: this.user }
            }));
            
            console.log('[AuthSystem] Usuario ya autenticado:', this.user.username);
        } else {
            console.log('[AuthSystem] No autenticado, mostrando login');
        }
    }

    /**
     * Cierra la sesión del usuario
     */
    logout() {
        console.log('[AuthSystem] Cerrando sesión...');
        
        // Limpiar datos locales
        this.token = null;
        this.user = null;
        localStorage.removeItem('iot_token');
        localStorage.removeItem('iot_user');
        
        // Emitir evento de logout
        document.dispatchEvent(new CustomEvent('auth:logout'));
        
        // Resetear store
        stateStore.reset();
        
        // Redirigir a login
        window.location.hash = '#login';
        
        // Forzar recarga para limpiar estado (opcional)
        setTimeout(() => {
            window.location.reload();
        }, 100);
    }

    /**
     * Verifica si el usuario está autenticado
     */
    isAuthenticated() {
        return !!this.token && !!this.user;
    }

    /**
     * Verifica si el token ha expirado
     */
    isTokenExpired() {
        // En un sistema real, esto decodificaría el JWT y verificaría el campo 'exp'.
        // Para demo, verificamos si ha pasado mucho tiempo desde el login
        const lastLogin = localStorage.getItem('iot_last_login');
        if (!lastLogin) return true;
        
        const loginTime = new Date(lastLogin).getTime();
        const currentTime = Date.now();
        const hoursSinceLogin = (currentTime - loginTime) / (1000 * 60 * 60);
        
        // Considerar expirado después de 24 horas para demo
        return hoursSinceLogin > 24;
    }

    /**
     * Obtiene el usuario actual
     */
    getCurrentUser() {
        return this.user;
    }

    /**
     * Obtiene el token actual
     */
    getCurrentToken() {
        return this.token;
    }

    /**
     * Verifica si el usuario tiene un rol específico
     */
    hasRole(role) {
        return this.user?.role === role;
    }

    /**
     * Verifica si el usuario tiene un permiso específico
     */
    hasPermission(permission) {
        return this.user?.permissions?.includes(permission) || false;
    }

    /**
     * Guarda los datos de autenticación en localStorage
     */
    saveAuthData() {
        localStorage.setItem('iot_token', this.token);
        localStorage.setItem('iot_user', JSON.stringify(this.user));
        localStorage.setItem('iot_last_login', new Date().toISOString());
    }

    // --- Gestión de Temas ---

    /**
     * Aplica el tema actual
     */
    applyTheme() {
        const body = document.body;
        body.classList.remove('operator-theme', 'supervisor-theme');
        body.classList.add(`${this.currentTheme}-theme`);
        
        // Actualizar variables CSS
        this.updateCSSVariables();
        
        console.log(`[AuthSystem] Tema aplicado: ${this.currentTheme}`);
    }

    /**
     * Actualiza las variables CSS según el tema
     */
    updateCSSVariables() {
        const root = document.documentElement;
        const theme = this.currentTheme === config.THEMES.SUPERVISOR ? 'supervisor' : 'operator';
        
        const variables = {
            '--bg-color': `var(--${theme}-bg)`,
            '--panel-color': `var(--${theme}-panel)`,
            '--border-color': `var(--${theme}-border)`,
            '--text-color': `var(--${theme}-text)`,
            '--text-secondary-color': `var(--${theme}-text-secondary)`,
            '--accent-color': `var(--${theme}-accent)`,
            '--danger-color': `var(--${theme}-danger)`,
            '--warning-color': `var(--${theme}-warning)`,
            '--success-color': `var(--${theme}-success)`,
            '--info-color': `var(--${theme}-info)`
        };
        
        Object.entries(variables).forEach(([key, value]) => {
            root.style.setProperty(key, value);
        });
    }

    /**
     * Cambia entre temas (solo para supervisores)
     */
    toggleTheme() {
        if (!this.user || !this.hasRole(config.ROLES.SUPERVISOR)) {
            console.warn('[AuthSystem] Solo supervisores pueden cambiar el tema');
            this.showNotification('Solo supervisores pueden cambiar el tema', 'warning');
            return;
        }

        const newTheme = this.currentTheme === config.THEMES.OPERATOR 
            ? config.THEMES.SUPERVISOR 
            : config.THEMES.OPERATOR;
        
        this.currentTheme = newTheme;
        localStorage.setItem('iot_theme', newTheme);
        
        this.applyTheme();
        this.updateToggleIcon();
        
        // Emitir evento de cambio de tema
        document.dispatchEvent(new CustomEvent('theme:changed', {
            detail: { theme: newTheme }
        }));
        
        console.log(`[AuthSystem] Tema cambiado a: ${newTheme}`);
    }

    /**
     * Actualiza el icono del toggle de tema
     */
    updateToggleIcon() {
        const themeToggle = document.getElementById('theme-toggle');
        if (!themeToggle) return;
        
        const icon = themeToggle.querySelector('i');
        if (icon) {
            icon.className = this.currentTheme === config.THEMES.OPERATOR 
                ? 'fas fa-lightbulb' 
                : 'fas fa-sun';
        }
    }

    /**
     * Actualiza la UI para usuario autenticado
     */
    updateAuthenticatedUI() {
        if (!this.user) return;
        
        const isSupervisor = this.hasRole(config.ROLES.SUPERVISOR);
        
        // Mostrar/Ocultar elementos según rol
        document.querySelectorAll('.supervisor-only').forEach(el => {
            el.classList.toggle('hidden', !isSupervisor);
        });

        // Actualizar información de usuario
        const usernameElement = document.getElementById('current-username');
        const roleElement = document.getElementById('current-role');
        
        if (usernameElement) {
            usernameElement.textContent = this.user.name || this.user.username;
        }
        
        if (roleElement) {
            roleElement.textContent = isSupervisor ? 'Supervisor' : 'Operador';
        }

        // Configurar toggle de tema (solo visible si es supervisor)
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.classList.toggle('hidden', !isSupervisor);
            this.updateToggleIcon();
        }
        
        // Mostrar header y footer
        document.getElementById('app-header').classList.remove('hidden');
        document.getElementById('app-footer').classList.remove('hidden');
        document.getElementById('login-page').classList.add('hidden');
    }

    /**
     * Muestra una notificación
     */
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `auth-notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${this.getNotificationIcon(type)}"></i>
            <span>${message}</span>
            <button class="notification-close"><i class="fas fa-times"></i></button>
        `;
        
        document.body.appendChild(notification);
        
        // Animación de entrada
        setTimeout(() => notification.classList.add('show'), 10);
        
        // Configurar cierre
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        });
        
        // Auto-remover después de 5 segundos
        setTimeout(() => {
            if (notification.parentNode && notification.classList.contains('show')) {
                notification.classList.remove('show');
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
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

    playErrorSound() {
        // Solo reproducir si está permitido
        if (document.visibilityState === 'visible') {
            try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                oscillator.frequency.value = 300;
                oscillator.type = 'sawtooth';
                
                gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
                
                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.3);
                
            } catch (error) {
                // Silenciar error si no se puede reproducir sonido
            }
        }
    }

    /**
     * Destruye el sistema de autenticación
     */
    destroy() {
        console.log('[AuthSystem] Destruyendo sistema de autenticación...');
        
        // Limpiar event listeners
        const loginForm = document.getElementById('login-form');
        const logoutBtn = document.getElementById('logout-btn');
        const themeToggle = document.getElementById('theme-toggle');
        
        if (loginForm) {
            loginForm.replaceWith(loginForm.cloneNode(true));
        }
        
        if (logoutBtn) {
            logoutBtn.replaceWith(logoutBtn.cloneNode(true));
        }
        
        if (themeToggle) {
            themeToggle.replaceWith(themeToggle.cloneNode(true));
        }
        
        this.isInitialized = false;
    }
}

// Crear y exportar instancia global
const auth = new AuthSystem();

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    auth.initialize().catch(error => {
        console.error('Error inicializando sistema de autenticación:', error);
    });
});

// Exportar para uso global
if (typeof window !== 'undefined') {
    window.auth = auth;
}

// Para módulos ES6
export { auth };
export default auth;