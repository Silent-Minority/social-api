import crypto from 'crypto';
import { generatePKCE, retrieveCodeVerifier, buildAuthUrl, exchangeCodeForTokens, getUserProfile } from './oauth';
import { TwitterOAuth } from '../oauth';
import { Request, Response } from 'express';

interface ValidationResult {
  test: string;
  passed: boolean;
  details: string;
  recommendation?: string;
}

interface OAuthValidationReport {
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    securityScore: number;
  };
  results: ValidationResult[];
  recommendations: string[];
}

// Mock Express Request/Response for testing
function createMockRes(): Response {
  const cookies: Record<string, any> = {};
  const signedCookies: Record<string, any> = {};
  
  return {
    cookie: (name: string, value: string, options?: any) => {
      if (options?.signed) {
        signedCookies[name] = value;
      } else {
        cookies[name] = value;
      }
    },
    clearCookie: () => {},
    // Mock other Response methods as needed
  } as any;
}

function createMockReq(signedCookies: Record<string, any> = {}): Request {
  return {
    signedCookies,
    // Mock other Request methods as needed
  } as any;
}

export class OAuthValidator {
  private results: ValidationResult[] = [];
  
  // Test 1: PKCE Code Generation Security
  validatePKCEGeneration(): ValidationResult {
    try {
      // Test multiple generations to ensure randomness
      const generations = [];
      for (let i = 0; i < 10; i++) {
        const mockRes = createMockRes();
        const pkce = generatePKCE(mockRes);
        generations.push(pkce);
      }
      
      // Check code verifier length (must be 43-128 characters)
      const validLengths = generations.every(g => 
        g.codeVerifier.length >= 43 && g.codeVerifier.length <= 128
      );
      
      // Check code verifier uses base64url encoding
      const validEncoding = generations.every(g => 
        /^[A-Za-z0-9_-]+$/.test(g.codeVerifier)
      );
      
      // Check challenge is SHA256 hash of verifier
      const validChallenges = generations.every(g => {
        const expectedChallenge = crypto.createHash('sha256')
          .update(g.codeVerifier)
          .digest('base64url');
        return g.codeChallenge === expectedChallenge;
      });
      
      // Check state randomness (all should be unique)
      const states = generations.map(g => g.state);
      const uniqueStates = new Set(states).size === states.length;
      
      // Check state format (hex string)
      const validStates = generations.every(g => 
        /^[a-f0-9]+$/.test(g.state) && g.state.length === 32
      );
      
      if (validLengths && validEncoding && validChallenges && uniqueStates && validStates) {
        return {
          test: "PKCE Code Generation",
          passed: true,
          details: `Generated ${generations.length} unique PKCE codes with valid format and security properties`
        };
      } else {
        const issues = [];
        if (!validLengths) issues.push("Invalid code verifier length");
        if (!validEncoding) issues.push("Invalid base64url encoding");
        if (!validChallenges) issues.push("Invalid SHA256 challenge generation");
        if (!uniqueStates) issues.push("Non-unique state values");
        if (!validStates) issues.push("Invalid state format");
        
        return {
          test: "PKCE Code Generation",
          passed: false,
          details: `Issues found: ${issues.join(', ')}`,
          recommendation: "Fix PKCE generation to meet RFC 7636 standards"
        };
      }
    } catch (error) {
      return {
        test: "PKCE Code Generation",
        passed: false,
        details: `Exception during testing: ${error instanceof Error ? error.message : String(error)}`,
        recommendation: "Fix PKCE generation implementation errors"
      };
    }
  }
  
  // Test 2: PKCE Storage and Retrieval Security
  validatePKCEStorage(): ValidationResult {
    try {
      const mockRes = createMockRes();
      const pkceData = generatePKCE(mockRes);
      
      // Test valid retrieval
      const mockReq = createMockReq(mockRes.signedCookies);
      const retrievedVerifier = retrieveCodeVerifier(pkceData.state, mockReq, mockRes);
      
      if (retrievedVerifier !== pkceData.codeVerifier) {
        return {
          test: "PKCE Storage and Retrieval",
          passed: false,
          details: "Code verifier retrieval failed for valid state",
          recommendation: "Check cookie storage and retrieval implementation"
        };
      }
      
      // Test state validation - invalid state should return null
      const invalidState = "invalid_state_" + Math.random().toString(36);
      const invalidRetrieval = retrieveCodeVerifier(invalidState, mockReq, mockRes);
      
      if (invalidRetrieval !== null) {
        return {
          test: "PKCE Storage and Retrieval",
          passed: false,
          details: "Invalid state accepted during retrieval",
          recommendation: "Strengthen state validation to prevent CSRF attacks"
        };
      }
      
      // Test expired state (simulate by modifying timestamp)
      const expiredMockReq = createMockReq({
        [`oauth_pkce_${pkceData.state}`]: JSON.stringify({
          codeVerifier: pkceData.codeVerifier,
          state: pkceData.state,
          timestamp: Date.now() - (25 * 60 * 1000) // 25 minutes ago (expired)
        })
      });
      
      const expiredRetrieval = retrieveCodeVerifier(pkceData.state, expiredMockReq, mockRes);
      
      if (expiredRetrieval !== null) {
        return {
          test: "PKCE Storage and Retrieval",
          passed: false,
          details: "Expired PKCE data accepted",
          recommendation: "Implement proper expiration checking"
        };
      }
      
      return {
        test: "PKCE Storage and Retrieval",
        passed: true,
        details: "PKCE storage, retrieval, state validation, and expiration work correctly"
      };
      
    } catch (error) {
      return {
        test: "PKCE Storage and Retrieval",
        passed: false,
        details: `Exception during testing: ${error instanceof Error ? error.message : String(error)}`,
        recommendation: "Fix PKCE storage implementation errors"
      };
    }
  }
  
  // Test 3: OAuth URL Construction
  validateOAuthURL(): ValidationResult {
    try {
      const clientId = "test_client_id";
      const redirectUri = "https://example.com/callback";
      const state = "test_state_123";
      const codeChallenge = "test_challenge";
      const scopes = "tweet.read tweet.write users.read offline.access";
      
      const authUrl = buildAuthUrl(clientId, redirectUri, state, codeChallenge, scopes);
      const url = new URL(authUrl);
      
      // Validate base URL
      if (url.origin !== "https://twitter.com" || url.pathname !== "/i/oauth2/authorize") {
        return {
          test: "OAuth URL Construction",
          passed: false,
          details: "Incorrect Twitter OAuth endpoint",
          recommendation: "Use correct Twitter OAuth 2.0 authorization endpoint"
        };
      }
      
      // Validate required parameters
      const params = url.searchParams;
      const requiredParams = {
        'response_type': 'code',
        'client_id': clientId,
        'redirect_uri': redirectUri,
        'scope': scopes,
        'state': state,
        'code_challenge': codeChallenge,
        'code_challenge_method': 'S256'
      };
      
      const missingParams = [];
      for (const [key, expectedValue] of Object.entries(requiredParams)) {
        const actualValue = params.get(key);
        if (actualValue !== expectedValue) {
          missingParams.push(`${key}: expected '${expectedValue}', got '${actualValue}'`);
        }
      }
      
      if (missingParams.length > 0) {
        return {
          test: "OAuth URL Construction",
          passed: false,
          details: `Parameter validation failed: ${missingParams.join(', ')}`,
          recommendation: "Ensure all required OAuth parameters are correctly set"
        };
      }
      
      return {
        test: "OAuth URL Construction",
        passed: true,
        details: "OAuth URL constructed correctly with all required parameters"
      };
      
    } catch (error) {
      return {
        test: "OAuth URL Construction",
        passed: false,
        details: `Exception during testing: ${error instanceof Error ? error.message : String(error)}`,
        recommendation: "Fix OAuth URL construction implementation"
      };
    }
  }
  
  // Test 4: TwitterOAuth Class Methods
  validateTwitterOAuthClass(): ValidationResult {
    try {
      // Test PKCE generation in TwitterOAuth class
      const pkce1 = TwitterOAuth.generatePKCE();
      const pkce2 = TwitterOAuth.generatePKCE();
      
      // Ensure different generations produce different results
      if (pkce1.codeVerifier === pkce2.codeVerifier || pkce1.codeChallenge === pkce2.codeChallenge) {
        return {
          test: "TwitterOAuth Class Methods",
          passed: false,
          details: "TwitterOAuth PKCE generation not producing unique values",
          recommendation: "Ensure proper randomness in PKCE generation"
        };
      }
      
      // Test state generation
      const state1 = TwitterOAuth.generateState();
      const state2 = TwitterOAuth.generateState();
      
      if (state1 === state2 || !/^[a-f0-9]+$/.test(state1) || state1.length !== 32) {
        return {
          test: "TwitterOAuth Class Methods",
          passed: false,
          details: "TwitterOAuth state generation issues",
          recommendation: "Fix state generation to produce unique hex strings"
        };
      }
      
      // Test authorization URL building
      const authUrl = TwitterOAuth.buildAuthorizationUrl(
        "test_client",
        "https://test.com/callback",
        "tweet.read",
        state1,
        pkce1.codeChallenge
      );
      
      if (!authUrl.includes("twitter.com/i/oauth2/authorize") || !authUrl.includes(pkce1.codeChallenge)) {
        return {
          test: "TwitterOAuth Class Methods",
          passed: false,
          details: "TwitterOAuth URL building issues",
          recommendation: "Fix TwitterOAuth URL construction"
        };
      }
      
      return {
        test: "TwitterOAuth Class Methods",
        passed: true,
        details: "TwitterOAuth class methods working correctly"
      };
      
    } catch (error) {
      return {
        test: "TwitterOAuth Class Methods",
        passed: false,
        details: `Exception during testing: ${error instanceof Error ? error.message : String(error)}`,
        recommendation: "Fix TwitterOAuth class implementation errors"
      };
    }
  }
  
  // Test 5: Security Validation
  validateSecurity(): ValidationResult {
    try {
      const securityIssues = [];
      
      // Test 1: Verify PKCE challenge method is S256 (not plain)
      const authUrl = buildAuthUrl("test", "https://test.com", "state", "challenge");
      if (!authUrl.includes("code_challenge_method=S256")) {
        securityIssues.push("Not using S256 challenge method (security risk)");
      }
      
      // Test 2: Ensure state parameter is cryptographically random
      const states = Array.from({length: 100}, () => {
        const mockRes = createMockRes();
        return generatePKCE(mockRes).state;
      });
      
      // Check for patterns or duplicates
      const uniqueStates = new Set(states);
      if (uniqueStates.size < states.length * 0.95) { // Allow some collisions but not many
        securityIssues.push("State generation may not be sufficiently random");
      }
      
      // Test 3: Verify secure cookie settings
      const mockRes = createMockRes();
      let cookieOptions: any = null;
      
      // Override cookie method to capture options
      mockRes.cookie = (name: string, value: string, options?: any) => {
        cookieOptions = options;
      };
      
      generatePKCE(mockRes);
      
      if (!cookieOptions?.httpOnly) {
        securityIssues.push("PKCE cookies not set as httpOnly");
      }
      if (!cookieOptions?.signed) {
        securityIssues.push("PKCE cookies not cryptographically signed");
      }
      if (cookieOptions?.sameSite !== 'lax') {
        securityIssues.push("PKCE cookies not using appropriate SameSite policy");
      }
      
      if (securityIssues.length > 0) {
        return {
          test: "Security Validation",
          passed: false,
          details: `Security issues found: ${securityIssues.join(', ')}`,
          recommendation: "Address security issues to harden OAuth implementation"
        };
      }
      
      return {
        test: "Security Validation",
        passed: true,
        details: "OAuth implementation meets security best practices"
      };
      
    } catch (error) {
      return {
        test: "Security Validation",
        passed: false,
        details: `Exception during security testing: ${error instanceof Error ? error.message : String(error)}`,
        recommendation: "Fix security validation implementation"
      };
    }
  }
  
  // Run all validations
  async runAllValidations(): Promise<OAuthValidationReport> {
    console.log("🔍 Starting OAuth validation tests...\n");
    
    this.results = [
      this.validatePKCEGeneration(),
      this.validatePKCEStorage(),
      this.validateOAuthURL(),
      this.validateTwitterOAuthClass(),
      this.validateSecurity()
    ];
    
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => r.failed).length;
    const securityScore = Math.round((passed / this.results.length) * 100);
    
    const recommendations = [
      ...this.results.filter(r => r.recommendation).map(r => r.recommendation!),
      "Implement automated OAuth security testing in CI/CD pipeline",
      "Consider implementing OAuth state cleanup for expired entries",
      "Add comprehensive logging for OAuth security events",
      "Implement rate limiting on OAuth endpoints"
    ];
    
    return {
      summary: {
        totalTests: this.results.length,
        passed,
        failed,
        securityScore
      },
      results: this.results,
      recommendations
    };
  }
  
  // Generate human-readable report
  generateReport(report: OAuthValidationReport): string {
    let output = "\n" + "=".repeat(60) + "\n";
    output += "               OAUTH VALIDATION REPORT\n";
    output += "=".repeat(60) + "\n\n";
    
    output += `📊 SUMMARY:\n`;
    output += `   Total Tests: ${report.summary.totalTests}\n`;
    output += `   ✅ Passed: ${report.summary.passed}\n`;
    output += `   ❌ Failed: ${report.summary.failed}\n`;
    output += `   🔒 Security Score: ${report.summary.securityScore}%\n\n`;
    
    output += `📋 DETAILED RESULTS:\n`;
    output += "-".repeat(40) + "\n";
    
    for (const result of report.results) {
      const status = result.passed ? "✅ PASS" : "❌ FAIL";
      output += `${status} - ${result.test}\n`;
      output += `   Details: ${result.details}\n`;
      if (result.recommendation) {
        output += `   💡 Recommendation: ${result.recommendation}\n`;
      }
      output += "\n";
    }
    
    output += `🔧 RECOMMENDATIONS:\n`;
    output += "-".repeat(40) + "\n";
    for (let i = 0; i < report.recommendations.length; i++) {
      output += `${i + 1}. ${report.recommendations[i]}\n`;
    }
    
    output += "\n" + "=".repeat(60) + "\n";
    
    return output;
  }
}

// Export for use in other modules
export async function validateOAuthImplementation(): Promise<OAuthValidationReport> {
  const validator = new OAuthValidator();
  return await validator.runAllValidations();
}

export async function printOAuthValidationReport(): Promise<void> {
  const validator = new OAuthValidator();
  const report = await validator.runAllValidations();
  console.log(validator.generateReport(report));
}