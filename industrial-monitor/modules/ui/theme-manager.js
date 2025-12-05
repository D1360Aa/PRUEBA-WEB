// modules/ui/theme-manager.js
import stateStore from '../../state/store.js';

export class ThemeManager {
    constructor(user) {
        this.user = user;
        this.currentTheme = localStorage.getItem('iot_theme') || config.THEMES.OPERATOR;
        this.isInitialized = false;
    }

    initialize() {
        if (this.isInitialized) return;
        
        console.log('[ThemeManager] Inicializando gestor de temas');
        
        // Aplicar tema guardado
        this.applyTheme(this.currentTheme);
        
        // Configurar event listeners
        this.setupEventListeners();
        
        // Configurar UI según rol
        this.setupUIForRole();
        
        this.isInitialized = true;
    }

    applyTheme(themeName) {
        const body = document.body;
        
        // Remover clases de tema anteriores
        body.classList.remove('operator-theme', 'supervisor-theme');
        
        // Añadir nueva clase de tema
        body.classList.add(`${themeName}-theme`);
        
        // Guardar preferencia
        this.currentTheme = themeName;
        localStorage.setItem('iot_theme', themeName);
        
        // Actualizar variables CSS
        this.updateCSSVariables(themeName);
        
        // Notificar cambio de tema
        document.dispatchEvent(new CustomEvent('theme:changed', {
            detail: { theme: themeName }
        }));
        
        console.log(`[ThemeManager] Tema aplicado: ${themeName}`);
    }

    updateCSSVariables(themeName) {
        const root = document.documentElement;
        const theme = themeName === config.THEMES.SUPERVISOR ? 'supervisor' : 'operator';
        
        // Actualizar variables CSS según tema
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

    setupEventListeners() {
        // Toggle de tema
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }
        
        // Escuchar cambios de usuario
        document.addEventListener('auth:userChanged', (event) => {
            this.user = event.detail.user;
            this.setupUIForRole();
        });
    }

    setupUIForRole() {
        const isSupervisor = this.user?.role === config.ROLES.SUPERVISOR;
        const themeToggle = document.getElementById('theme-toggle');
        
        // Mostrar/ocultar toggle de tema según rol
        if (themeToggle) {
            themeToggle.classList.toggle('hidden', !isSupervisor);
        }
        
        // Actualizar icono del toggle
        this.updateToggleIcon();
    }

    toggleTheme() {
        // Solo supervisores pueden cambiar el tema
        if (this.user?.role !== config.ROLES.SUPERVISOR) {
            console.warn('[ThemeManager] Solo supervisores pueden cambiar el tema');
            this.showNotification('Solo supervisores pueden cambiar el tema', 'warning');
            return;
        }
        
        const newTheme = this.currentTheme === config.THEMES.OPERATOR 
            ? config.THEMES.SUPERVISOR 
            : config.THEMES.OPERATOR;
        
        this.applyTheme(newTheme);
        this.updateToggleIcon();
        
        // Notificar a otros componentes
        this.notifyThemeChange(newTheme);
    }

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

    notifyThemeChange(newTheme) {
        // Notificar a componentes específicos
        const event = new CustomEvent('theme:changed', {
            detail: { 
                theme: newTheme,
                previousTheme: this.currentTheme 
            }
        });
        
        document.dispatchEvent(event);
        
        // Notificar al dashboard para redibujar gráficos
        if (window.dashboard) {
            window.dashboard.reDrawGauges();
        }
    }

    showNotification(message, type = 'info') {
        // Notificación simple
        const notification = document.createElement('div');
        notification.className = `theme-notification notification-${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => notification.classList.add('show'), 10);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    getCurrentTheme() {
        return this.currentTheme;
    }

    isDarkTheme() {
        return this.currentTheme === config.THEMES.OPERATOR;
    }

    destroy() {
        console.log('[ThemeManager] Destruyendo gestor de temas');
        
        // Limpiar event listeners
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.removeEventListener('click', () => this.toggleTheme());
        }
        
        this.isInitialized = false;
    }
}

// Función de inicialización para la app principal
export function initializeThemeManager(user) {
    const themeManager = new ThemeManager(user);
    themeManager.initialize();
    return themeManager;
}