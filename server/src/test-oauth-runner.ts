import { printOAuthValidationReport } from './oauth-validation';

// Run the OAuth validation and exit
printOAuthValidationReport()
  .then(() => {
    console.log("\n✅ OAuth validation completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ OAuth validation failed:", error);
    process.exit(1);
  });