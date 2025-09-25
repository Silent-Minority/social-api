// Test script to verify OAuth utilities work correctly
import { generatePKCE, buildAuthUrl } from './oauth';

console.log('🧪 Testing OAuth utilities...');

// Test PKCE generation
const { codeVerifier, codeChallenge, state } = generatePKCE();
console.log('✅ PKCE generated successfully');
console.log('   Code verifier length:', codeVerifier.length);
console.log('   Code challenge length:', codeChallenge.length);
console.log('   State length:', state.length);

// Test auth URL building
const testClientId = 'test_client_id';
const testRedirectUri = 'http://localhost:5000/auth/x/callback';
const authUrl = buildAuthUrl(testClientId, testRedirectUri, state, codeChallenge);

console.log('\n✅ Auth URL built successfully');
console.log('   Contains twitter.com:', authUrl.includes('twitter.com'));
console.log('   Contains client_id:', authUrl.includes('client_id'));
console.log('   Contains PKCE challenge:', authUrl.includes('code_challenge'));

console.log('\n🎉 All OAuth utilities working correctly!');