// components/TrendChart.js - Componente de gráfico de tendencias optimizado
export class TrendChart {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.options = {
            showGrid: true,
            showPoints: true,
            showArea: true,
            smoothLines: true,
            animationDuration: 1000,
            maintainAspectRatio: false,
            responsive: true,
            ...options
        };
        
        // Datos
        this.datasets = [];
        this.labels = [];
        this.metadata = {
            minValue: 0,
            maxValue: 100,
            range: 100
        };
        
        // Estado de animación
        this.animationId = null;
        this.isAnimating = false;
        this.animationStart = 0;
        
        // Cache y optimización
        this.resizeObserver = null;
        this.cachedDimensions = {
            width: 0,
            height: 0,
            padding: { top: 40, right: 40, bottom: 40, left: 60 },
            dpr: 1
        };
        
        this.colorCache = new Map();
        this.isDestroyed = false;
        
        this.initialize();
    }

    initialize() {
        if (!this.canvas || !this.ctx) {
            console.error('[TrendChart] Canvas o contexto no disponibles');
            return;
        }
        
        // Configurar observer para redimensionamiento
        if (this.options.responsive && 'ResizeObserver' in window) {
            this.resizeObserver = new ResizeObserver(entries => {
                requestAnimationFrame(() => {
                    if (!this.isDestroyed) {
                        this.handleResize();
                    }
                });
            });
            
            if (this.canvas.parentElement) {
                this.resizeObserver.observe(this.canvas.parentElement);
            }
        }
        
        // Manejar redimensionamiento inicial
        this.handleResize();
        
        // Renderizar estado inicial
        this.draw();
        
        console.log('[TrendChart] Inicializado');
    }

    handleResize() {
        if (this.isDestroyed) return;
        
        const parent = this.canvas.parentElement;
        if (!parent) return;
        
        const width = parent.clientWidth;
        const height = parent.clientHeight;
        const dpr = window.devicePixelRatio || 1;
        
        // Configurar canvas para alta resolución
        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
        
        // Escalar contexto
        this.ctx.scale(dpr, dpr);
        
        // Actualizar cache de dimensiones
        this.updateCachedDimensions(width, height, dpr);
        
        // Limpiar cache de colores
        this.colorCache.clear();
        
        // Redibujar
        this.draw();
    }

    updateCachedDimensions(width, height, dpr) {
        this.cachedDimensions = {
            width,
            height,
            padding: {
                top: Math.max(30, height * 0.1),
                right: Math.max(30, width * 0.05),
                bottom: Math.max(40, height * 0.15),
                left: Math.max(60, width * 0.1)
            },
            dpr,
            chartWidth: 0,
            chartHeight: 0
        };
        
        const p = this.cachedDimensions.padding;
        this.cachedDimensions.chartWidth = width - p.left - p.right;
        this.cachedDimensions.chartHeight = height - p.top - p.bottom;
    }

    setData(datasets, labels, metadata = {}) {
        if (this.isDestroyed) return;
        
        this.datasets = datasets;
        this.labels = labels;
        this.metadata = {
            ...this.metadata,
            ...metadata
        };
        
        // Calcular rango si no se proporciona
        if (!this.metadata.range || !this.metadata.minValue || !this.metadata.maxValue) {
            this.calculateDataRange();
        }
        
        // Animar transición si hay datos anteriores
        if (this.options.animationDuration > 0 && this.datasets.length > 0) {
            this.animateDataUpdate();
        } else {
            this.draw();
        }
    }

    calculateDataRange() {
        if (this.datasets.length === 0) {
            this.metadata = {
                minValue: 0,
                maxValue: 100,
                range: 100
            };
            return;
        }
        
        // Encontrar valores mínimos y máximos en todos los datasets
        let min = Infinity;
        let max = -Infinity;
        
        this.datasets.forEach(dataset => {
            if (!Array.isArray(dataset)) return;
            
            dataset.forEach(value => {
                if (typeof value === 'number') {
                    min = Math.min(min, value);
                    max = Math.max(max, value);
                }
            });
        });
        
        // Añadir margen del 10%
        const margin = (max - min) * 0.1;
        this.metadata.minValue = min - margin;
        this.metadata.maxValue = max + margin;
        this.metadata.range = this.metadata.maxValue - this.metadata.minValue;
        
        // Si el rango es 0 (todos los valores iguales), ajustar
        if (this.metadata.range === 0) {
            this.metadata.minValue -= 10;
            this.metadata.maxValue += 10;
            this.metadata.range = 20;
        }
    }

    animateDataUpdate() {
        if (this.isAnimating) {
            cancelAnimationFrame(this.animationId);
        }
        
        this.isAnimating = true;
        this.animationStart = performance.now();
        
        const animate = (currentTime) => {
            if (this.isDestroyed) return;
            
            const elapsed = currentTime - this.animationStart;
            const progress = Math.min(elapsed / this.options.animationDuration, 1);
            
            // Easing function: easeOutCubic
            const easedProgress = 1 - Math.pow(1 - progress, 3);
            
            // Renderizar con progreso de animación
            this.draw(easedProgress);
            
            if (progress < 1) {
                this.animationId = requestAnimationFrame(animate);
            } else {
                this.isAnimating = false;
                this.animationId = null;
                this.draw(1); // Dibujar final
            }
        };
        
        this.animationId = requestAnimationFrame(animate);
    }

    draw(animationProgress = 1) {
        if (this.isDestroyed || !this.ctx) return;
        
        const d = this.cachedDimensions;
        const ctx = this.ctx;
        
        // Limpiar canvas
        ctx.clearRect(0, 0, d.width * d.dpr, d.height * d.dpr);
        
        // Si no hay datos, mostrar mensaje
        if (this.datasets.length === 0 || this.labels.length === 0) {
            this.drawNoData();
            return;
        }
        
        // Calcular transformaciones
        const xScale = d.chartWidth / Math.max(1, this.labels.length - 1);
        const yScale = d.chartHeight / this.metadata.range;
        
        // Dibujar componentes
        if (this.options.showGrid) {
            this.drawGrid(xScale, yScale);
        }
        
        // Dibujar datasets
        this.datasets.forEach((dataset, index) => {
            if (animationProgress < 1) {
                // Animación: dibujar progresivamente
                this.drawAnimatedDataset(dataset, index, xScale, yScale, animationProgress);
            } else {
                // Dibujar completo
                this.drawDataset(dataset, index, xScale, yScale);
            }
        });
        
        // Dibujar ejes y leyenda
        this.drawAxes();
        this.drawLegend();
    }

    drawGrid(xScale, yScale) {
        const d = this.cachedDimensions;
        const ctx = this.ctx;
        const p = d.padding;
        
        ctx.save();
        ctx.strokeStyle = this.getColor('grid');
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 3]);
        
        // Líneas horizontales (valores Y)
        const ySteps = 5;
        for (let i = 0; i <= ySteps; i++) {
            const value = this.metadata.minValue + (this.metadata.range / ySteps) * i;
            const y = p.top + d.chartHeight - ((value - this.metadata.minValue) * yScale);
            
            ctx.beginPath();
            ctx.moveTo(p.left, y);
            ctx.lineTo(p.left + d.chartWidth, y);
            ctx.stroke();
            
            // Etiqueta de valor
            ctx.fillStyle = this.getColor('text');
            ctx.font = '10px Inter, sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(value.toFixed(0), p.left - 10, y);
        }
        
        // Líneas verticales (tiempo X)
        const xSteps = Math.min(6, this.labels.length);
        const step = Math.max(1, Math.floor(this.labels.length / xSteps));
        
        for (let i = 0; i < this.labels.length; i += step) {
            const x = p.left + (i * xScale);
            
            ctx.beginPath();
            ctx.moveTo(x, p.top);
            ctx.lineTo(x, p.top + d.chartHeight);
            ctx.stroke();
            
            // Etiqueta de tiempo
            ctx.fillStyle = this.getColor('text');
            ctx.font = '10px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(this.labels[i], x, p.top + d.chartHeight + 5);
        }
        
        ctx.restore();
    }

    drawDataset(dataset, datasetIndex, xScale, yScale) {
        if (!Array.isArray(dataset) || dataset.length === 0) return;
        
        const d = this.cachedDimensions;
        const ctx = this.ctx;
        const p = d.padding;
        
        // Color para este dataset
        const color = this.getDatasetColor(datasetIndex);
        const areaColor = this.getDatasetColor(datasetIndex, 0.1);
        
        // Crear path para el área
        if (this.options.showArea) {
            ctx.beginPath();
            ctx.moveTo(p.left, p.top + d.chartHeight);
            
            dataset.forEach((value, index) => {
                const x = p.left + (index * xScale);
                const y = p.top + d.chartHeight - ((value - this.metadata.minValue) * yScale);
                
                if (index === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
            
            ctx.lineTo(p.left + ((dataset.length - 1) * xScale), p.top + d.chartHeight);
            ctx.closePath();
            
            // Rellenar área
            ctx.fillStyle = areaColor;
            ctx.fill();
        }
        
        // Crear path para la línea
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        
        if (this.options.smoothLines && dataset.length > 1) {
            // Línea suavizada
            this.drawSmoothLine(dataset, xScale, yScale);
        } else {
            // Línea recta
            dataset.forEach((value, index) => {
                const x = p.left + (index * xScale);
                const y = p.top + d.chartHeight - ((value - this.metadata.minValue) * yScale);
                
                if (index === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
        }
        
        ctx.stroke();
        
        // Dibujar puntos
        if (this.options.showPoints) {
            dataset.forEach((value, index) => {
                const x = p.left + (index * xScale);
                const y = p.top + d.chartHeight - ((value - this.metadata.minValue) * yScale);
                
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();
                ctx.strokeStyle = this.getColor('background');
                ctx.lineWidth = 1;
                ctx.stroke();
            });
        }
    }

    drawAnimatedDataset(dataset, datasetIndex, xScale, yScale, progress) {
        if (!Array.isArray(dataset) || dataset.length === 0) return;
        
        const d = this.cachedDimensions;
        const ctx = this.ctx;
        const p = d.padding;
        
        // Calcular cuántos puntos dibujar según progreso
        const pointsToDraw = Math.ceil(dataset.length * progress);
        const partialDataset = dataset.slice(0, pointsToDraw);
        
        // Color para este dataset
        const color = this.getDatasetColor(datasetIndex);
        const areaColor = this.getDatasetColor(datasetIndex, 0.1 * progress);
        
        // Área animada
        if (this.options.showArea && pointsToDraw > 1) {
            ctx.beginPath();
            ctx.moveTo(p.left, p.top + d.chartHeight);
            
            partialDataset.forEach((value, index) => {
                const x = p.left + (index * xScale);
                const y = p.top + d.chartHeight - ((value - this.metadata.minValue) * yScale);
                
                if (index === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
            
            // Cerrar path para el área
            const lastX = p.left + ((pointsToDraw - 1) * xScale);
            ctx.lineTo(lastX, p.top + d.chartHeight);
            ctx.closePath();
            
            ctx.fillStyle = areaColor;
            ctx.fill();
        }
        
        // Línea animada
        if (pointsToDraw > 0) {
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            
            partialDataset.forEach((value, index) => {
                const x = p.left + (index * xScale);
                const y = p.top + d.chartHeight - ((value - this.metadata.minValue) * yScale);
                
                if (index === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
            
            ctx.stroke();
            
            // Punto final animado
            if (pointsToDraw > 0) {
                const lastValue = partialDataset[pointsToDraw - 1];
                const lastX = p.left + ((pointsToDraw - 1) * xScale);
                const lastY = p.top + d.chartHeight - ((lastValue - this.metadata.minValue) * yScale);
                
                ctx.beginPath();
                ctx.arc(lastX, lastY, 6, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();
                ctx.strokeStyle = this.getColor('background');
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        }
    }

    drawSmoothLine(dataset, xScale, yScale) {
        const d = this.cachedDimensions;
        const ctx = this.ctx;
        const p = d.padding;
        
        // Algoritmo de Catmull-Rom para líneas suaves
        const points = dataset.map((value, index) => ({
            x: p.left + (index * xScale),
            y: p.top + d.chartHeight - ((value - this.metadata.minValue) * yScale)
        }));
        
        ctx.moveTo(points[0].x, points[0].y);
        
        for (let i = 0; i < points.length - 1; i++) {
            const p0 = i > 0 ? points[i - 1] : points[i];
            const p1 = points[i];
            const p2 = points[i + 1];
            const p3 = i < points.length - 2 ? points[i + 2] : p2;
            
            // Calcular puntos de control para Catmull-Rom
            const cp1x = p1.x + (p2.x - p0.x) / 6;
            const cp1y = p1.y + (p2.y - p0.y) / 6;
            const cp2x = p2.x - (p3.x - p1.x) / 6;
            const cp2y = p2.y - (p3.y - p1.y) / 6;
            
            ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
        }
    }

    drawAxes() {
        const d = this.cachedDimensions;
        const ctx = this.ctx;
        const p = d.padding;
        
        ctx.save();
        ctx.strokeStyle = this.getColor('axis');
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        
        // Eje Y
        ctx.beginPath();
        ctx.moveTo(p.left, p.top);
        ctx.lineTo(p.left, p.top + d.chartHeight);
        ctx.stroke();
        
        // Eje X
        ctx.beginPath();
        ctx.moveTo(p.left, p.top + d.chartHeight);
        ctx.lineTo(p.left + d.chartWidth, p.top + d.chartHeight);
        ctx.stroke();
        
        ctx.restore();
    }

    drawLegend() {
        if (this.datasets.length <= 1) return;
        
        const d = this.cachedDimensions;
        const ctx = this.ctx;
        const p = d.padding;
        
        const legendX = p.left + d.chartWidth - 150;
        const legendY = p.top + 20;
        const itemHeight = 20;
        
        ctx.save();
        ctx.fillStyle = this.getColor('panel', 0.9);
        ctx.strokeStyle = this.getColor('border');
        ctx.lineWidth = 1;
        
        // Fondo de leyenda
        const legendWidth = 140;
        const legendHeight = this.datasets.length * itemHeight + 10;
        
        ctx.beginPath();
        ctx.roundRect(legendX, legendY, legendWidth, legendHeight, 5);
        ctx.fill();
        ctx.stroke();
        
        // Items de leyenda
        this.datasets.forEach((dataset, index) => {
            const y = legendY + 5 + (index * itemHeight);
            const color = this.getDatasetColor(index);
            
            // Color muestra
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.roundRect(legendX + 10, y - 6, 12, 12, 3);
            ctx.fill();
            
            // Texto
            const motorName = config.MOTORS[index]?.name || `Motor ${index + 1}`;
            ctx.fillStyle = this.getColor('text');
            ctx.font = '11px Inter, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(motorName, legendX + 30, y);
        });
        
        ctx.restore();
    }

    drawNoData() {
        const d = this.cachedDimensions;
        const ctx = this.ctx;
        
        ctx.save();
        ctx.fillStyle = this.getColor('text', 0.5);
        ctx.font = '16px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('No hay datos disponibles', d.width / 2, d.height / 2);
        ctx.restore();
    }

    getColor(type, alpha = 1) {
        const theme = document.body.classList.contains('supervisor-theme') ? 'supervisor' : 'operator';
        const colorKey = `${type}_${theme}_${alpha}`;
        
        if (this.colorCache.has(colorKey)) {
            return this.colorCache.get(colorKey);
        }
        
        let color;
        
        switch (type) {
            case 'grid':
                color = theme === 'operator' ? '#334155' : '#e2e8f0';
                break;
                
            case 'axis':
                color = theme === 'operator' ? '#475569' : '#cbd5e1';
                break;
                
            case 'text':
                color = theme === 'operator' ? '#f8fafc' : '#1e293b';
                break;
                
            case 'background':
                color = theme === 'operator' ? '#0f172a' : '#f8fafc';
                break;
                
            case 'panel':
                color = theme === 'operator' ? '#1e293b' : '#ffffff';
                break;
                
            case 'border':
                color = theme === 'operator' ? '#334155' : '#e2e8f0';
                break;
                
            default:
                color = '#000000';
        }
        
        // Aplicar alpha si es necesario
        if (alpha < 1) {
            const rgb = this.hexToRgb(color);
            color = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
        }
        
        this.colorCache.set(colorKey, color);
        return color;
    }

    getDatasetColor(index, alpha = 1) {
        const colors = [
            getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim(),
            getComputedStyle(document.documentElement).getPropertyValue('--success-color').trim(),
            getComputedStyle(document.documentElement).getPropertyValue('--info-color').trim(),
            getComputedStyle(document.documentElement).getPropertyValue('--warning-color').trim()
        ];
        
        const color = colors[index % colors.length];
        
        if (alpha < 1) {
            const rgb = this.hexToRgb(color);
            return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
        }
        
        return color;
    }

    hexToRgb(hex) {
        // Expandir formato corto (#RGB a #RRGGBB)
        const longHex = hex.replace(/^#?([a-f\d])([a-f\d])([a-f\d])$/i, 
            (m, r, g, b) => r + r + g + g + b + b);
        
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(longHex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    }

    destroy() {
        if (this.isDestroyed) return;
        
        console.log('[TrendChart] Destruyendo gráfico');
        
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
        
        // Limpiar cache
        this.colorCache.clear();
        
        // Limpiar referencias
        this.canvas = null;
        this.ctx = null;
        this.datasets = [];
        this.labels = [];
        this.isDestroyed = true;
    }

    // Métodos de utilidad
    getData() {
        return {
            datasets: [...this.datasets],
            labels: [...this.labels],
            metadata: { ...this.metadata }
        };
    }

    updateOptions(newOptions) {
        this.options = { ...this.options, ...newOptions };
        this.colorCache.clear();
        this.draw();
    }

    clear() {
        this.datasets = [];
        this.labels = [];
        this.metadata = {
            minValue: 0,
            maxValue: 100,
            range: 100
        };
        this.draw();
    }

    // Método estático para creación fácil
    static create(selector, options) {
        const canvas = typeof selector === 'string' 
            ? document.querySelector(selector)
            : selector;
        
        if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
            console.error('[TrendChart.create] Selector no válido o no es un canvas');
            return null;
        }
        
        return new TrendChart(canvas, options);
    }
}

// Polyfill para roundRect si no existe
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, width, height, radius) {
        if (width < 2 * radius) radius = width / 2;
        if (height < 2 * radius) radius = height / 2;
        
        this.beginPath();
        this.moveTo(x + radius, y);
        this.arcTo(x + width, y, x + width, y + height, radius);
        this.arcTo(x + width, y + height, x, y + height, radius);
        this.arcTo(x, y + height, x, y, radius);
        this.arcTo(x, y, x + width, y, radius);
        this.closePath();
        return this;
    };
}

// Exportar para uso global
if (typeof window !== 'undefined') {
    window.TrendChart = TrendChart;
    window.initTrendChart = () => {
        const canvas = document.getElementById('trend-chart');
        if (canvas) {
            return TrendChart.create(canvas, {
                showGrid: true,
                showPoints: true,
                showArea: true,
                smoothLines: true,
                animationDuration: 800
            });
        }
        return null;
    };
    
    window.updateTrendChart = (datasets, labels, metadata) => {
        const chart = window.initTrendChart();
        if (chart) {
            chart.setData(datasets, labels, metadata);
        }
    };
}

export default TrendChart;