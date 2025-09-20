const axios = require("axios");
exports.handler = async (event) => {
  // Parse event body if present
  const monolitoUrl = process.env.MONOLITO_URL || 'http://monolito:3000';
  const resp = await axios.post(
    `${monolitoUrl}/api/admin/process-pending-transactions`,
    null,
    { headers: { Authorization: `Bearer local-key-123` } }
  );
  return {
    statusCode: 200,
    body: JSON.stringify({
      tool: "process_pending_transactions",
      data: resp.data,
    }),
  };
};
