// modules/dashboard/historical-data-service.js
import stateStore from '../../state/store.js';

export class HistoricalDataService {
    constructor() {
        this.apiBaseUrl = config.API_BASE_URL;
        this.cache = new Map();
        this.cacheTTL = 5 * 60 * 1000; // 5 minutos
        
        // IndexedDB para almacenamiento persistente (si está disponible)
        this.dbName = 'IndustrialMonitorDB';
        this.dbVersion = 1;
        this.db = null;
        
        this.initializeDatabase();
    }

    async initializeDatabase() {
        if (!window.indexedDB) {
            console.log('[HistoricalDataService] IndexedDB no disponible, usando cache en memoria');
            return;
        }
        
        try {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Crear object store para datos históricos
                if (!db.objectStoreNames.contains('historicalData')) {
                    const store = db.createObjectStore('historicalData', { keyPath: 'id' });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('variable_motor', ['variable', 'motor'], { unique: false });
                }
                
                // Crear object store para cache
                if (!db.objectStoreNames.contains('cache')) {
                    db.createObjectStore('cache', { keyPath: 'key' });
                }
            };
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log('[HistoricalDataService] IndexedDB inicializado');
            };
            
            request.onerror = (event) => {
                console.error('[HistoricalDataService] Error inicializando IndexedDB:', event.target.error);
            };
            
        } catch (error) {
            console.error('[HistoricalDataService] Error en IndexedDB:', error);
        }
    }

    async loadInitialHistoricalData(variable = 'temperature', motor = 'm1') {
        const cacheKey = `initial_${variable}_${motor}`;
        
        // 1. Intentar cache en memoria
        if (this.isCacheValid(cacheKey)) {
            console.log('[HistoricalDataService] Cache en memoria hit:', cacheKey);
            return this.cache.get(cacheKey).data;
        }
        
        // 2. Intentar IndexedDB
        const dbData = await this.getFromIndexedDB(cacheKey);
        if (dbData && this.isCacheValidInDB(dbData)) {
            console.log('[HistoricalDataService] IndexedDB hit:', cacheKey);
            this.cache.set(cacheKey, dbData);
            return dbData.data;
        }
        
        // 3. Intentar API
        try {
            const apiData = await this.fetchFromAPI(variable, motor, '24h');
            const processedData = this.processHistoricalData(apiData, variable, motor);
            
            // Almacenar en cache
            const cacheItem = {
                key: cacheKey,
                data: processedData,
                timestamp: Date.now(),
                variable,
                motor
            };
            
            this.cache.set(cacheKey, cacheItem);
            await this.saveToIndexedDB(cacheItem);
            
            return processedData;
            
        } catch (error) {
            console.warn('[HistoricalDataService] Error cargando datos iniciales, usando fallback:', error);
            return this.generateFallbackData(variable, motor);
        }
    }

    async loadDataForChart(variable, motor, timeRange = '24h') {
        const cacheKey = `${variable}_${motor}_${timeRange}`;
        
        // Verificar cache primero
        if (this.isCacheValid(cacheKey)) {
            return this.cache.get(cacheKey).data;
        }
        
        try {
            // Intentar API
            const apiData = await this.fetchFromAPI(variable, motor, timeRange);
            const processedData = this.processHistoricalData(apiData, variable, motor);
            
            // Actualizar cache
            const cacheItem = {
                key: cacheKey,
                data: processedData,
                timestamp: Date.now(),
                variable,
                motor,
                timeRange
            };
            
            this.cache.set(cacheKey, cacheItem);
            await this.saveToIndexedDB(cacheItem);
            
            return processedData;
            
        } catch (error) {
            console.warn('[HistoricalDataService] Error cargando datos para gráfico, usando fallback:', error);
            return this.generateFallbackData(variable, motor);
        }
    }

    async fetchFromAPI(variable, motor, timeRange) {
        const token = window.auth?.token;
        if (!token) {
            throw new Error('Usuario no autenticado');
        }
        
        // Construir URL de API
        const endpoint = `${this.apiBaseUrl}/api/telemetry/historical`;
        const params = new URLSearchParams({
            variable,
            motor,
            range: timeRange,
            limit: '100' // Limitar cantidad de puntos
        });
        
        const response = await fetch(`${endpoint}?${params}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`API responded with status ${response.status}`);
        }
        
        return await response.json();
    }

    processHistoricalData(rawData, variable, motor) {
        if (!rawData || !Array.isArray(rawData) || rawData.length === 0) {
            throw new Error('Datos históricos vacíos o inválidos');
        }
        
        // Invertir para mostrar los más recientes al final
        const data = [...rawData].reverse();
        
        const labels = [];
        const datasets = [];
        
        // Preparar datasets según motor seleccionado
        if (motor === 'both' || motor === 'm1') {
            datasets[0] = [];
        }
        if (motor === 'both' || motor === 'm2') {
            datasets[1] = [];
        }
        
        // Calcular estadísticas
        let sumM1 = 0, sumM2 = 0;
        let countM1 = 0, countM2 = 0;
        let minValue = Infinity, maxValue = -Infinity;
        
        data.forEach((item, index) => {
            // Etiqueta de tiempo
            const timestamp = new Date(item.timestamp);
            labels.push(this.formatTimeLabel(timestamp, index, data.length));
            
            // Procesar datos para motor 1
            if (motor === 'both' || motor === 'm1') {
                const keyM1 = `${variable}_motor1`;
                const valueM1 = item[keyM1] || 0;
                datasets[0].push(valueM1);
                
                sumM1 += valueM1;
                countM1++;
                minValue = Math.min(minValue, valueM1);
                maxValue = Math.max(maxValue, valueM1);
            }
            
            // Procesar datos para motor 2
            if (motor === 'both' || motor === 'm2') {
                const keyM2 = `${variable}_motor2`;
                const valueM2 = item[keyM2] || 0;
                datasets[1] = datasets[1] || [];
                datasets[1].push(valueM2);
                
                sumM2 += valueM2;
                countM2++;
                minValue = Math.min(minValue, valueM2);
                maxValue = Math.max(maxValue, valueM2);
            }
        });
        
        // Calcular estadísticas
        const metadata = {
            minValue: Math.floor(minValue * 10) / 10,
            maxValue: Math.ceil(maxValue * 10) / 10,
            averageM1: countM1 > 0 ? (sumM1 / countM1).toFixed(1) : 0,
            averageM2: countM2 > 0 ? (sumM2 / countM2).toFixed(1) : 0,
            dataPoints: data.length,
            variable,
            motor
        };
        
        // Filtrar datasets vacíos
        const filteredDatasets = datasets.filter(dataset => dataset && dataset.length > 0);
        
        return {
            datasets: filteredDatasets,
            labels,
            metadata
        };
    }

    formatTimeLabel(timestamp, index, total) {
        // Formato inteligente basado en cantidad de puntos
        if (total <= 12) {
            // Mostrar hora completa si hay pocos puntos
            return timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (total <= 24) {
            // Mostrar cada 2 horas
            if (index % 2 === 0 || index === total - 1) {
                return timestamp.toLocaleTimeString([], { hour: '2-digit' }) + 'h';
            }
            return '';
        } else {
            // Mostrar cada 4 horas
            if (index % 4 === 0 || index === total - 1) {
                return timestamp.toLocaleTimeString([], { hour: '2-digit' }) + 'h';
            }
            return '';
        }
    }

    generateFallbackData(variable = 'temperature', motor = 'm1') {
        const points = 24;
        const datasets = [];
        const labels = [];
        
        // Valores base según variable y motor
        const baseValues = this.getBaseValues(variable, motor);
        
        // Generar datos simulados con tendencia realista
        for (let i = 0; i < points; i++) {
            // Etiqueta de tiempo (últimas 24 horas)
            const hour = (23 - i).toString().padStart(2, '0');
            labels.push(`${hour}:00`);
            
            // Generar datos para motor 1
            if (motor === 'both' || motor === 'm1') {
                if (!datasets[0]) datasets[0] = new Array(points);
                datasets[0][i] = this.generateDataPoint(i, baseValues.m1, variable);
            }
            
            // Generar datos para motor 2
            if (motor === 'both' || motor === 'm2') {
                if (!datasets[1]) datasets[1] = new Array(points);
                datasets[1][i] = this.generateDataPoint(i, baseValues.m2, variable);
            }
        }
        
        // Invertir para orden cronológico
        labels.reverse();
        datasets.forEach(dataset => dataset?.reverse());
        
        // Filtrar datasets vacíos
        const filteredDatasets = datasets.filter(dataset => dataset && dataset.length > 0);
        
        return {
            datasets: filteredDatasets,
            labels,
            metadata: {
                minValue: Math.min(...filteredDatasets.flat()) - 5,
                maxValue: Math.max(...filteredDatasets.flat()) + 5,
                variable,
                motor,
                isFallback: true
            }
        };
    }

    getBaseValues(variable, motor) {
        const bases = {
            temperature: { m1: 75, m2: 78 },
            oil_pressure: { m1: 45, m2: 42 },
            clutch_pressure: { m1: 120, m2: 118 }
        };
        
        return {
            m1: bases[variable]?.m1 || 50,
            m2: bases[variable]?.m2 || 50
        };
    }

    generateDataPoint(index, baseValue, variable) {
        const timeFactor = index / 24;
        
        // Patrones de variación según variable
        const patterns = {
            temperature: {
                amplitude: 8,
                frequency: 2,
                noise: 1.5,
                trend: -0.1 // Ligera tendencia descendente
            },
            oil_pressure: {
                amplitude: 5,
                frequency: 1.5,
                noise: 1,
                trend: 0.05 // Ligera tendencia ascendente
            },
            clutch_pressure: {
                amplitude: 10,
                frequency: 3,
                noise: 2,
                trend: 0
            }
        };
        
        const pattern = patterns[variable] || patterns.temperature;
        
        // Variación sinusoidal con tendencia
        const variation = Math.sin(timeFactor * Math.PI * pattern.frequency) * pattern.amplitude;
        const trend = pattern.trend * index;
        const noise = (Math.random() * 2 - 1) * pattern.noise;
        
        const value = baseValue + variation + trend + noise;
        
        // Mantener valores dentro de rangos razonables
        return Math.max(0, Math.round(value * 10) / 10);
    }

    // Métodos de cache
    isCacheValid(key) {
        const cached = this.cache.get(key);
        if (!cached) return false;
        
        const age = Date.now() - cached.timestamp;
        return age < this.cacheTTL;
    }

    async getFromIndexedDB(key) {
        if (!this.db) return null;
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['cache'], 'readonly');
            const store = transaction.objectStore('cache');
            const request = store.get(key);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async saveToIndexedDB(item) {
        if (!this.db) return;
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['cache'], 'readwrite');
            const store = transaction.objectStore('cache');
            const request = store.put(item);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    isCacheValidInDB(dbItem) {
        if (!dbItem || !dbItem.timestamp) return false;
        
        const age = Date.now() - dbItem.timestamp;
        return age < this.cacheTTL;
    }

    clearCache() {
        this.cache.clear();
        console.log('[HistoricalDataService] Cache limpiado');
    }

    // Método para limpiar cache antiguo
    cleanupOldCache() {
        const now = Date.now();
        let cleanedCount = 0;
        
        this.cache.forEach((value, key) => {
            if (now - value.timestamp > this.cacheTTL) {
                this.cache.delete(key);
                cleanedCount++;
            }
        });
        
        if (cleanedCount > 0) {
            console.log(`[HistoricalDataService] Limpiados ${cleanedCount} items del cache`);
        }
    }

    // Método para obtener estadísticas del servicio
    getServiceStats() {
        return {
            cacheSize: this.cache.size,
            hasIndexedDB: !!this.db,
            cacheTTL: this.cacheTTL
        };
    }
}