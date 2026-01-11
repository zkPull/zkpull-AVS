#!/usr/bin/env node

/**
 * Operator Registration Entry Point
 * Register as zkTLS Operator
 */

const { RegisterController } = require("./register.controller");

async function main() {
  const controller = new RegisterController();
  await controller.execute();
}

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  });
}

module.exports = { RegisterController };
