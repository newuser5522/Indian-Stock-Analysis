/**
 * Simple logging utility for production
 */
const LOG_LEVEL = process.env.LOG_LEVEL || "info";

const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const currentLevel = LEVELS[LOG_LEVEL as keyof typeof LEVELS] || LEVELS.info;

function formatLog(level: string, message: string, data?: any) {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, data);
  } else {
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
  }
}

export const logger = {
  error: (message: string, data?: any) => {
    if (currentLevel >= LEVELS.error) formatLog("error", message, data);
  },
  warn: (message: string, data?: any) => {
    if (currentLevel >= LEVELS.warn) formatLog("warn", message, data);
  },
  info: (message: string, data?: any) => {
    if (currentLevel >= LEVELS.info) formatLog("info", message, data);
  },
  debug: (message: string, data?: any) => {
    if (currentLevel >= LEVELS.debug) formatLog("debug", message, data);
  },
};
