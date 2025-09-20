const axios = require("axios");
const monolitoUrl = process.env.MONOLITO_URL || 'http://monolito:3000';
exports.handler = async (event) => {
  const { lines = 50 } = JSON.parse(event.body || event);
  const resp = await axios.get(
    `${monolitoUrl}/api/logs/closure?lines=${lines}`,
    { headers: { Authorization: `Bearer local-key-123` } }
  );
  return {
    statusCode: 200,
    body: JSON.stringify({ tool: "read_local_logs", data: resp.data }),
  };
};
