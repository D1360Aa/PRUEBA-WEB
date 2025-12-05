// components/Gauge.js - Componente Gauge optimizado
export class Gauge {
    constructor(canvas, options) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.options = {
            minValue: 0,
            maxValue: 100,
            normalMin: 25,
            normalMax: 75,
            criticalLow: 0,
            criticalHigh: 100,
            unit: '',
            title: 'Gauge',
            showMinMax: true,
            showValue: true,
            showTitle: true,
            animationDuration: 500,
            ...options
        };
        
        this.value = this.options.minValue;
        this.targetValue = this.options.minValue;
        this.currentValue = this.options.minValue;
        this.status = 'normal';
        
        // Optimización de performance
        this.animationId = null;
        this.lastRenderTime = 0;
        this.resizeObserver = null;
        this.isDestroyed = false;
        
        // Cache de dimensiones
        this.cachedDimensions = {
            width: 0,
            height: 0,
            centerX: 0,
            centerY: 0,
            radius: 0
        };
        
        // Cache de gradientes
        this.gradientCache = new Map();
        
        this.initialize();
    }

    initialize() {
        if (!this.canvas || !this.ctx) {
            console.error('[Gauge] Canvas o contexto no disponibles');
            return;
        }
        
        // Configurar observer para redimensionamiento
        if ('ResizeObserver' in window) {
            this.resizeObserver = new ResizeObserver(entries => {
                for (const entry of entries) {
                    if (entry.target === this.canvas.parentElement) {
                        this.handleResize();
                    }
                }
            });
            
            if (this.canvas.parentElement) {
                this.resizeObserver.observe(this.canvas.parentElement);
            }
        }
        
        // Manejar redimensionamiento inicial
        this.handleResize();
        
        // Renderizar valor inicial
        this.draw();
        
        console.log(`[Gauge] Inicializado: ${this.options.title}`);
    }

    handleResize() {
        if (this.isDestroyed) return;
        
        const parent = this.canvas.parentElement;
        if (!parent) return;
        
        // Calcular tamaño basado en el contenedor
        const size = Math.min(parent.clientWidth, parent.clientHeight);
        const dpr = window.devicePixelRatio || 1;
        
        // Configurar canvas para alta resolución
        this.canvas.width = size * dpr;
        this.canvas.height = size * dpr;
        this.canvas.style.width = `${size}px`;
        this.canvas.style.height = `${size}px`;
        
        // Escalar contexto para alta resolución
        this.ctx.scale(dpr, dpr);
        
        // Actualizar cache de dimensiones
        this.updateCachedDimensions(size);
        
        // Limpiar cache de gradientes
        this.gradientCache.clear();
        
        // Redibujar
        this.draw();
    }

    updateCachedDimensions(size) {
        this.cachedDimensions = {
            width: size,
            height: size,
            centerX: size / 2,
            centerY: size / 2,
            radius: size * 0.4,
            arcWidth: size * 0.08,
            dpr: window.devicePixelRatio || 1
        };
    }

    setValue(newValue, animate = true) {
        if (this.isDestroyed) return;
        
        // Validar y limitar valor
        const clampedValue = Math.max(
            this.options.minValue, 
            Math.min(this.options.maxValue, newValue)
        );
        
        this.value = clampedValue;
        this.targetValue = clampedValue;
        
        // Determinar estado basado en valor
        this.updateStatus();
        
        if (!animate) {
            this.currentValue = this.targetValue;
            this.draw();
            return;
        }
        
        // Cancelar animación anterior si existe
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        // Iniciar nueva animación
        this.animateToValue();
    }

    updateStatus() {
        const value = this.currentValue;
        const opts = this.options;
        
        if (value >= opts.criticalHigh || value <= opts.criticalLow) {
            this.status = 'critical';
        } else if (value > opts.normalMax || value < opts.normalMin) {
            this.status = 'warning';
        } else {
            this.status = 'normal';
        }
    }

    setStatus(status) {
        if (['normal', 'warning', 'critical'].includes(status)) {
            this.status = status;
            this.draw();
        }
    }

    animateToValue() {
        const startTime = performance.now();
        const startValue = this.currentValue;
        const valueDiff = this.targetValue - startValue;
        const duration = this.options.animationDuration;
        
        const animate = (currentTime) => {
            if (this.isDestroyed) return;
            
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Easing function: easeOutCubic
            const easedProgress = 1 - Math.pow(1 - progress, 3);
            
            this.currentValue = startValue + (valueDiff * easedProgress);
            
            // Renderizar frame
            this.draw();
            
            if (progress < 1) {
                this.animationId = requestAnimationFrame(animate);
            } else {
                this.currentValue = this.targetValue;
                this.animationId = null;
            }
        };
        
        this.animationId = requestAnimationFrame(animate);
    }

    draw() {
        if (this.isDestroyed || !this.ctx) return;
        
        const d = this.cachedDimensions;
        const ctx = this.ctx;
        
        // Limpiar canvas (optimizado)
        ctx.clearRect(0, 0, d.width * d.dpr, d.height * d.dpr);
        
        // Dibujar componentes
        this.drawBackgroundArc();
        this.drawColorZones();
        this.drawValueArc();
        this.drawNeedle();
        this.drawLabels();
        
        this.lastRenderTime = performance.now();
    }

    drawBackgroundArc() {
        const d = this.cachedDimensions;
        const ctx = this.ctx;
        
        ctx.beginPath();
        ctx.arc(d.centerX, d.centerY, d.radius, Math.PI * 1.25, Math.PI * 1.75, false);
        ctx.lineWidth = d.arcWidth;
        ctx.strokeStyle = this.getColor('background');
        ctx.stroke();
    }

    drawColorZones() {
        const d = this.cachedDimensions;
        const ctx = this.ctx;
        const opts = this.options;
        
        // Zona crítica baja
        if (opts.criticalLow > opts.minValue) {
            this.drawArcSection(
                opts.minValue, 
                opts.criticalLow, 
                'critical'
            );
        }
        
        // Zona de advertencia baja
        if (opts.normalMin > opts.criticalLow) {
            this.drawArcSection(
                opts.criticalLow, 
                opts.normalMin, 
                'warning'
            );
        }
        
        // Zona normal
        this.drawArcSection(
            opts.normalMin, 
            opts.normalMax, 
            'normal'
        );
        
        // Zona de advertencia alta
        if (opts.criticalHigh > opts.normalMax) {
            this.drawArcSection(
                opts.normalMax, 
                opts.criticalHigh, 
                'warning'
            );
        }
        
        // Zona crítica alta
        if (opts.maxValue > opts.criticalHigh) {
            this.drawArcSection(
                opts.criticalHigh, 
                opts.maxValue, 
                'critical'
            );
        }
    }

    drawArcSection(startValue, endValue, severity) {
        const d = this.cachedDimensions;
        const ctx = this.ctx;
        
        const startAngle = this.valueToAngle(startValue);
        const endAngle = this.valueToAngle(endValue);
        
        if (startAngle >= endAngle) return;
        
        ctx.beginPath();
        ctx.arc(d.centerX, d.centerY, d.radius, startAngle, endAngle, false);
        ctx.lineWidth = d.arcWidth;
        ctx.strokeStyle = this.getColor(severity);
        ctx.stroke();
    }

    drawValueArc() {
        const d = this.cachedDimensions;
        const ctx = this.ctx;
        
        const currentAngle = this.valueToAngle(this.currentValue);
        
        ctx.beginPath();
        ctx.arc(d.centerX, d.centerY, d.radius, Math.PI * 1.25, currentAngle, false);
        ctx.lineWidth = d.arcWidth * 0.9;
        ctx.strokeStyle = this.getColor('value');
        ctx.lineCap = 'round';
        ctx.stroke();
    }

    drawNeedle() {
        const d = this.cachedDimensions;
        const ctx = this.ctx;
        const angle = this.valueToAngle(this.currentValue);
        const needleLength = d.radius - d.arcWidth / 2;
        
        // Centro de la aguja
        ctx.beginPath();
        ctx.arc(d.centerX, d.centerY, d.arcWidth / 3, 0, Math.PI * 2, false);
        ctx.fillStyle = this.getColor('needle');
        ctx.fill();
        
        // Línea de la aguja
        ctx.save();
        ctx.translate(d.centerX, d.centerY);
        ctx.rotate(angle - Math.PI * 0.75);
        
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(needleLength * 0.95, 0);
        ctx.lineWidth = 3;
        ctx.strokeStyle = this.getColor('needle');
        ctx.stroke();
        
        // Punto de la aguja
        ctx.beginPath();
        ctx.arc(needleLength * 0.95, 0, 4, 0, Math.PI * 2, false);
        ctx.fillStyle = this.getColor('needle');
        ctx.fill();
        
        ctx.restore();
    }

    drawLabels() {
        const d = this.cachedDimensions;
        const ctx = this.ctx;
        const opts = this.options;
        
        ctx.textAlign = 'center';
        ctx.fillStyle = this.getColor('text');
        
        // Valor actual
        if (opts.showValue) {
            ctx.font = `600 ${d.width * 0.12}px Inter, sans-serif`;
            ctx.fillText(
                `${this.currentValue.toFixed(1)}${opts.unit}`,
                d.centerX,
                d.centerY + d.width * 0.15
            );
        }
        
        // Título
        if (opts.showTitle) {
            ctx.font = `500 ${d.width * 0.08}px Inter, sans-serif`;
            ctx.fillText(
                opts.title,
                d.centerX,
                d.centerY - d.width * 0.25
            );
        }
        
        // Min/Max
        if (opts.showMinMax) {
            ctx.font = `300 ${d.width * 0.06}px Inter, sans-serif`;
            
            // Mínimo
            ctx.textAlign = 'left';
            ctx.fillText(
                `${opts.minValue}${opts.unit}`,
                d.width * 0.1,
                d.width * 0.85
            );
            
            // Máximo
            ctx.textAlign = 'right';
            ctx.fillText(
                `${opts.maxValue}${opts.unit}`,
                d.width * 0.9,
                d.width * 0.85
            );
        }
    }

    valueToAngle(value) {
        const range = this.options.maxValue - this.options.minValue;
        const normalizedValue = (value - this.options.minValue) / range;
        
        // Ángulos en radianes: Inicio (225°): 1.25*PI, Fin (-45° o 315°): 1.75*PI
        const startAngle = Math.PI * 1.25;
        const angleRange = Math.PI * 1.5; // 270 grados
        
        return startAngle + (angleRange * normalizedValue);
    }

    getColor(type) {
        // Cache de colores para mejor performance
        const colorKey = `${type}_${this.status}_${this.currentTheme}`;
        
        if (this.gradientCache.has(colorKey)) {
            return this.gradientCache.get(colorKey);
        }
        
        let color;
        const theme = document.body.classList.contains('supervisor-theme') ? 'supervisor' : 'operator';
        
        switch (type) {
            case 'background':
                color = theme === 'operator' ? '#334155' : '#e2e8f0';
                break;
                
            case 'normal':
                color = getComputedStyle(document.documentElement)
                    .getPropertyValue('--success-color')
                    .trim();
                break;
                
            case 'warning':
                color = getComputedStyle(document.documentElement)
                    .getPropertyValue('--warning-color')
                    .trim();
                break;
                
            case 'critical':
                color = getComputedStyle(document.documentElement)
                    .getPropertyValue('--danger-color')
                    .trim();
                break;
                
            case 'value':
            case 'needle':
                color = getComputedStyle(document.documentElement)
                    .getPropertyValue('--accent-color')
                    .trim();
                break;
                
            case 'text':
                color = getComputedStyle(document.documentElement)
                    .getPropertyValue('--text-color')
                    .trim();
                break;
                
            default:
                color = '#000000';
        }
        
        this.gradientCache.set(colorKey, color);
        return color;
    }

    get currentTheme() {
        return document.body.classList.contains('supervisor-theme') ? 'supervisor' : 'operator';
    }

    redraw() {
        this.gradientCache.clear();
        this.draw();
    }

    destroy() {
        if (this.isDestroyed) return;
        
        console.log(`[Gauge] Destruyendo: ${this.options.title}`);
        
        // Cancelar animaciones
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        // Desconectar observer
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        
        // Limpiar canvas
        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
        
        // Limpiar referencias
        this.canvas = null;
        this.ctx = null;
        this.gradientCache.clear();
        this.isDestroyed = true;
    }

    // Métodos de utilidad
    getCurrentValue() {
        return this.currentValue;
    }

    getTargetValue() {
        return this.targetValue;
    }

    getStatus() {
        return this.status;
    }

    isAnimating() {
        return this.animationId !== null;
    }

    // Método estático para crear gauges fácilmente
    static create(selector, options) {
        const canvas = typeof selector === 'string' 
            ? document.querySelector(selector)
            : selector;
        
        if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
            console.error('[Gauge.create] Selector no válido o no es un canvas');
            return null;
        }
        
        return new Gauge(canvas, options);
    }
}

// Exportar para uso global
if (typeof window !== 'undefined') {
    window.Gauge = Gauge;
}

export default Gauge;