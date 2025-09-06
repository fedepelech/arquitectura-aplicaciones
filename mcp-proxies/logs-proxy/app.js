const axios = require("axios");
exports.handler = async (event) => {
  const { lines = 50 } = JSON.parse(event.body || event);
  const resp = await axios.get(
    `http://restaurant-api:3000/api/logs/closure?lines=${lines}`,
    { headers: { Authorization: `Bearer local-key-123` } }
  );
  return {
    statusCode: 200,
    body: JSON.stringify({ tool: "read_local_logs", data: resp.data }),
  };
};
