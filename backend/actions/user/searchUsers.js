const adClient = require("../../services/adClient");

async function execute({ query }, audit, credential) {
  try {
    const results = await adClient.searchUsers(query, credential);
    return results;
  } catch (err) {
    // Fehler beim Suchen ist ungewöhnlich genug um geloggt zu werden
    audit.log({
      action:     "USER_SEARCH",
      target:     query,
      targetType: "user",
      result:     "failure",
      error:      err.message,
    });
    throw err;
  }
}

module.exports = { execute };
