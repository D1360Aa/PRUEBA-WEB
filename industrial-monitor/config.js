// config.js - Configuración extendida para nueva arquitectura
const config = {
  // Backend FastAPI
  API_BASE_URL: 'http://localhost:8000',
  
  // Autenticación
  JWT_SECRET: 'iot-industrial-secret-key-2024',
  JWT_EXPIRES_IN: '24h',
  
  // WebSocket de tu backend FastAPI
  WS_URL: 'ws://localhost:8000/ws/telemetry',

  // Intervalo de Polling (5000ms = 5 segundos)
  DATA_REFRESH_INTERVAL: 5000,
  
  // Intervalo de verificación de conexión (10 segundos)
  CONNECTION_CHECK_INTERVAL: 10000,
  
  // Roles del sistema
  ROLES: {
    OPERATOR: 'operator',
    SUPERVISOR: 'supervisor'
  },
  
  // Motores industriales
  MOTORS: [
    {
      id: 'motor1',
      name: 'Motor Principal',
      variables: [
        { 
          key: 'temperature', 
          name: 'Temperatura', 
          unit: '°C', 
          min: 0, 
          max: 120, 
          normalMin: 70, 
          normalMax: 90, 
          critical: 100 
        },
        { 
          key: 'oil_pressure', 
          name: 'Presión de Aceite', 
          unit: 'Psi', 
          min: 0, 
          max: 100, 
          normalMin: 35, 
          normalMax: 55, 
          criticalLow: 30, 
          criticalHigh: 60 
        },
        { 
          key: 'clutch_pressure', 
          name: 'Presión de Clutch', 
          unit: 'Psi', 
          min: 50, 
          max: 180, 
          normalMin: 110, 
          normalMax: 130, 
          criticalLow: 100, 
          criticalHigh: 140 
        }
      ]
    },
    {
      id: 'motor2',
      name: 'Motor Secundario',
      variables: [
        { 
          key: 'temperature', 
          name: 'Temperatura', 
          unit: '°C', 
          min: 0, 
          max: 120, 
          normalMin: 70, 
          normalMax: 90, 
          critical: 100 
        },
        { 
          key: 'oil_pressure', 
          name: 'Presión de Aceite', 
          unit: 'Psi', 
          min: 0, 
          max: 100, 
          normalMin: 35, 
          normalMax: 55, 
          criticalLow: 30, 
          criticalHigh: 60 
        },
        { 
          key: 'clutch_pressure', 
          name: 'Presión de Clutch', 
          unit: 'Psi', 
          min: 50, 
          max: 180, 
          normalMin: 110, 
          normalMax: 130, 
          criticalLow: 100, 
          criticalHigh: 140 
        }
      ]
    }
  ],
  
  // Temas visuales
  THEMES: {
    OPERATOR: 'operator', // Oscuro
    SUPERVISOR: 'supervisor' // Claro
  },
  
  // Configuración de alertas
  ALERTS: {
    MAX_HISTORY: 100,
    CRITICAL_NOTIFICATION_DURATION: 10000, // 10 segundos
    WARNING_NOTIFICATION_DURATION: 5000,   // 5 segundos
    AUTO_RESOLVE_DELAY: 300000 // 5 minutos
  },
  
  // Configuración de cache
  CACHE: {
    HISTORICAL_DATA_TTL: 300000, // 5 minutos
    TELEMETRY_DATA_TTL: 10000,   // 10 segundos
    MAX_CACHE_SIZE: 50
  },
  
  // Configuración de rendimiento
  PERFORMANCE: {
    DEBOUNCE_DELAY: 300, // ms
    ANIMATION_FRAME_DELAY: 16, // ~60fps
    BATCH_UPDATE_SIZE: 10
  },
  
  // Configuración de conexión
  CONNECTION: {
    MAX_RETRIES: 10,
    INITIAL_RECONNECT_DELAY: 3000, // 3 segundos
    MAX_RECONNECT_DELAY: 30000,    // 30 segundos
    BACKOFF_MULTIPLIER: 1.5
  }
};

// Hacer disponible globalmente
if (typeof window !== 'undefined') {
  window.config = config;
}

// Para módulos ES6
export { config };