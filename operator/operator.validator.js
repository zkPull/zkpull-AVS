/**
 * Validator service for zkTLS proof verification
 * Handles PR verification and proof generation
 */

const { ethers } = require("ethers");
const axios = require("axios");
const { CONFIG, TIMEOUTS } = require("./operator.constants");

class ZKTLSValidator {
  /**
   * Verify PR merge status using zkTLS
   */
  async verifyPR(prLink, accessToken) {
    try {
      console.log(`   🔐 Verifying with zkTLS...`);

      this._validatePRLink(prLink);

      console.log(`   📡 Calling zkTLS API...`);
      console.log(`      URL: ${prLink}`);
      console.log(
        `      Token: ${accessToken ? "***" + accessToken.slice(-4) : "(none)"}`
      );

      const { prProofData, userProofData } = await this._callZKTLSAPI(
        prLink,
        accessToken
      );

      console.log(`   🔍 Verifying proof data...`);

      const verificationResult = this._extractAndVerifyProof(
        prProofData,
        userProofData
      );

      this._logVerificationResult(verificationResult);

      const zkProof = this._createZKProof(
        prProofData,
        userProofData,
        verificationResult
      );

      return {
        isValid: verificationResult.isValid,
        zkProof,
        metadata: {
          isMerged: verificationResult.isMerged,
          isValidUser: verificationResult.isValidUser,
          isValidId: verificationResult.isValidId,
          githubUsername: verificationResult.githubUsername,
          githubUserId: verificationResult.githubUserId,
        },
      };
    } catch (error) {
      console.error("   ❌ zkTLS verification failed:", error.message);
      console.error("   Operator not submitting proof.");
      if (error.response) {
        console.error("   📄 Response status:", error.response.status);
        console.error(
          "   📄 Response data:",
          JSON.stringify(error.response.data, null, 2)
        );
      }

      throw new Error(`zkTLS verification failed: ${error.message}`);
    }
  }

  /**
   * Validate GitHub PR link format
   */
  _validatePRLink(prLink) {
    const match = prLink.match(
      /github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/
    );
    if (!match) {
      throw new Error("Invalid GitHub PR link");
    }
    return match;
  }

  /**
   * Call zkTLS API to generate proof
   */
  async _callZKTLSAPI(prLink, accessToken) {
    const response = await axios.get(
      `${CONFIG.zkTLSApiUrl}/generate-proof?url=${encodeURIComponent(prLink)}`,
      {
        headers: {
          Authorization: `Bearer ${
            accessToken || process.env.ZKTLS_ACCESS_TOKEN || ""
          }`,
        },
        timeout: TIMEOUTS.ZKTLS_API,
      }
    );

    console.log(`   📦 Response received (status: ${response.status})`);

    const { prProofData, userProofData } = response.data;

    if (!prProofData || !userProofData) {
      console.log(`   ❌ Invalid response structure`);
      console.log(`      Expected: { prProofData, userProofData }`);
      console.log(`      Got keys:`, Object.keys(response.data));
      throw new Error("Invalid response format from zkTLS API");
    }

    return { prProofData, userProofData };
  }

  /**
   * Extract and verify proof data
   */
  _extractAndVerifyProof(prProofData, userProofData) {
    const proofString = JSON.stringify({ prProofData, userProofData });

    const contextRegex = /"context":\s*"({.*?})"/g;
    const matches = [...proofString.matchAll(contextRegex)];

    if (matches.length < 2) {
      throw new Error("Could not extract context from proof data");
    }

    const prProofDataContext = this._parseJSONSafely(matches[0][1]);
    const userProofDataContext = this._parseJSONSafely(matches[1][1]);

    const prProofString = JSON.stringify(prProofDataContext);
    const userProofString = JSON.stringify(userProofDataContext);

    return this._verifyProofData(prProofString, userProofString);
  }

  /**
   * Parse JSON string safely with escaped quotes handling
   */
  _parseJSONSafely(jsonString) {
    try {
      const cleanedString = jsonString.replace(/\\"/g, '"');
      return JSON.parse(cleanedString);
    } catch (error) {
      console.error("Error parsing JSON:", error);
      return {};
    }
  }

  /**
   * Verify proof data using regex matching
   */
  _verifyProofData(prProofString, userProofString) {
    const mergedRegex = /"merged"\s*:\s*"(\w+)"/;
    const loginRegex = /"login"\s*:\s*"([^"]+)"/;
    const idRegex = /"id"\s*:\s*"(\d+)"/;

    const prMergedMatch = prProofString.match(mergedRegex);
    const prLoginMatch = prProofString.match(loginRegex);
    const prIdMatch = prProofString.match(idRegex);
    const userLoginMatch = userProofString.match(loginRegex);
    const userIdMatch = userProofString.match(idRegex);

    const isMerged = prMergedMatch ? prMergedMatch[1] === "true" : false;
    const isValidUser =
      prLoginMatch && userLoginMatch
        ? prLoginMatch[1] === userLoginMatch[1]
        : false;
    const isValidId =
      prIdMatch && userIdMatch ? prIdMatch[1] === userIdMatch[1] : false;

    const githubUsername = prLoginMatch ? prLoginMatch[1] : "unknown";
    const githubUserId = prIdMatch ? prIdMatch[1] : "unknown";
    const userLogin = userLoginMatch ? userLoginMatch[1] : "unknown";
    const userId = userIdMatch ? userIdMatch[1] : "unknown";

    const isValid = isMerged && isValidUser && isValidId;

    return {
      isMerged,
      isValidUser,
      isValidId,
      githubUsername,
      githubUserId,
      userLogin,
      userId,
      isValid,
    };
  }

  /**
   * Log verification result
   */
  _logVerificationResult(result) {
    console.log(`   ✅ zkTLS Operator Verification:`);
    console.log(`      - isMerged: ${result.isMerged}`);
    console.log(
      `      - isValidUser: ${result.isValidUser} (PR: ${result.githubUsername}, User: ${result.userLogin})`
    );
    console.log(
      `      - isValidId: ${result.isValidId} (PR: ${result.githubUserId}, User: ${result.userId})`
    );
    console.log(`      - Overall Valid: ${result.isValid ? "✅" : "❌"}`);
  }

  /**
   * Create zkProof bytes from verification data
   */
  _createZKProof(prProofData, userProofData, verificationResult) {
    return ethers.utils.hexlify(
      ethers.utils.toUtf8Bytes(
        JSON.stringify({
          prProof: prProofData,
          userProof: userProofData,
          verified: {
            isMerged: verificationResult.isMerged,
            isValidUser: verificationResult.isValidUser,
            isValidId: verificationResult.isValidId,
            githubUsername: verificationResult.githubUsername,
            githubUserId: verificationResult.githubUserId,
            userLogin: verificationResult.userLogin,
            userId: verificationResult.userId,
            timestamp: Date.now(),
          },
        })
      )
    );
  }

  /**
   * Fallback verification using GitHub API
   * Kept for backward compatibility but should not be used in production
   */
  async fallbackVerification(prLink) {
    try {
      console.log("   ⚠️  Using fallback verification...");

      const match = prLink.match(
        /github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/
      );
      if (!match) {
        return { isValid: false, zkProof: "0x" };
      }

      const [, owner, repo, prNumber] = match;

      const response = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
        {
          headers: {
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "zkPull-Operator-Bot",
          },
        }
      );

      const merged = response.data.merged === true;

      return {
        isValid: merged,
        zkProof: ethers.utils.hexlify(
          ethers.utils.toUtf8Bytes(JSON.stringify({ fallback: true, merged }))
        ),
      };
    } catch (error) {
      console.error("   ❌ Fallback verification failed:", error.message);
      return { isValid: false, zkProof: "0x" };
    }
  }
}

module.exports = { ZKTLSValidator };
