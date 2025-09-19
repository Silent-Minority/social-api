/**
 * Security utilities for token redaction and response sanitization
 */

export interface TokenRedactionConfig {
  replacement?: string;
  tokenFields?: string[];
}

const DEFAULT_TOKEN_FIELDS = [
  'access_token',
  'refresh_token',
  'accessToken',
  'refreshToken',
  'token',
  'bearer_token',
  'client_secret',
  'authorization'
];

const DEFAULT_REPLACEMENT = '[REDACTED]';

/**
 * Redacts sensitive token data from any object or string
 */
export function redactTokens(
  data: any, 
  config: TokenRedactionConfig = {}
): any {
  const { replacement = DEFAULT_REPLACEMENT, tokenFields = DEFAULT_TOKEN_FIELDS } = config;
  
  if (typeof data === 'string') {
    // Redact common token patterns in strings
    let result = data;
    
    // Redact Bearer tokens
    result = result.replace(/Bearer\s+[A-Za-z0-9\-_\.]+/gi, `Bearer ${replacement}`);
    
    // Redact access tokens (common patterns)
    result = result.replace(/(["\']?)access_token\1\s*[:=]\s*["\']?[A-Za-z0-9\-_\.]+["\']?/gi, 
                          `$1access_token$1: "${replacement}"`);
                          
    // Redact refresh tokens
    result = result.replace(/(["\']?)refresh_token\1\s*[:=]\s*["\']?[A-Za-z0-9\-_\.]+["\']?/gi, 
                          `$1refresh_token$1: "${replacement}"`);
    
    return result;
  }
  
  if (data === null || data === undefined) {
    return data;
  }
  
  if (Array.isArray(data)) {
    return data.map(item => redactTokens(item, config));
  }
  
  if (typeof data === 'object') {
    const result: any = {};
    
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      
      // Check if this field contains sensitive data
      if (tokenFields.some(field => lowerKey.includes(field.toLowerCase()))) {
        result[key] = replacement;
      } else {
        result[key] = redactTokens(value, config);
      }
    }
    
    return result;
  }
  
  return data;
}

/**
 * Safe logging utility that automatically redacts tokens
 */
export const safeLog = {
  log: (message: string, data?: any) => {
    console.log(message, data ? redactTokens(data) : undefined);
  },
  
  info: (message: string, data?: any) => {
    console.info(message, data ? redactTokens(data) : undefined);
  },
  
  warn: (message: string, data?: any) => {
    console.warn(message, data ? redactTokens(data) : undefined);
  },
  
  error: (message: string, data?: any) => {
    console.error(message, data ? redactTokens(data) : undefined);
  }
};

/**
 * Strips sensitive token fields from API response objects
 */
export function sanitizeApiResponse(data: any): any {
  if (!data) return data;
  
  if (Array.isArray(data)) {
    return data.map(item => sanitizeApiResponse(item));
  }
  
  if (typeof data === 'object') {
    const sanitized = { ...data };
    
    // Remove sensitive token fields completely
    delete sanitized.accessToken;
    delete sanitized.access_token;
    delete sanitized.refreshToken;
    delete sanitized.refresh_token;
    delete sanitized.token;
    delete sanitized.bearer_token;
    delete sanitized.client_secret;
    
    // Recursively sanitize nested objects
    Object.keys(sanitized).forEach(key => {
      if (typeof sanitized[key] === 'object') {
        sanitized[key] = sanitizeApiResponse(sanitized[key]);
      }
    });
    
    return sanitized;
  }
  
  return data;
}

/**
 * Express middleware to automatically sanitize all API responses
 */
export function tokenSanitizationMiddleware(req: any, res: any, next: any) {
  const originalJson = res.json;
  
  res.json = function(obj: any) {
    const sanitizedData = sanitizeApiResponse(obj);
    return originalJson.call(this, sanitizedData);
  };
  
  next();
}

/**
 * Validates that an object contains no sensitive token data
 */
export function validateNoTokens(data: any, context: string = 'data'): boolean {
  const tokenFields = DEFAULT_TOKEN_FIELDS;
  
  function checkObject(obj: any, path: string): string[] {
    const violations: string[] = [];
    
    if (!obj || typeof obj !== 'object') {
      return violations;
    }
    
    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        violations.push(...checkObject(item, `${path}[${index}]`));
      });
      return violations;
    }
    
    Object.entries(obj).forEach(([key, value]) => {
      const lowerKey = key.toLowerCase();
      const currentPath = path ? `${path}.${key}` : key;
      
      // Check if field name suggests it contains a token
      if (tokenFields.some(field => lowerKey.includes(field.toLowerCase()))) {
        violations.push(`Token field found at ${currentPath}`);
      }
      
      // Check if value looks like a token (long alphanumeric string)
      if (typeof value === 'string' && value.length > 20 && /^[A-Za-z0-9\-_\.]+$/.test(value)) {
        violations.push(`Potential token value at ${currentPath}`);
      }
      
      // Recursively check nested objects
      if (typeof value === 'object') {
        violations.push(...checkObject(value, currentPath));
      }
    });
    
    return violations;
  }
  
  const violations = checkObject(data, context);
  
  if (violations.length > 0) {
    console.error(`🚨 Token Security Violation in ${context}:`, violations);
    return false;
  }
  
  return true;
}