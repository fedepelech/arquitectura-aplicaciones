const axios = require("axios");
exports.handler = async (event) => {
  // Parse event body if present
  const body = event && event.body ? JSON.parse(event.body) : {};
  const resp = await axios.post(
    "http://restaurant-api:3000/api/admin/force-close-shifts",
    null,
    { headers: { Authorization: `Bearer local-key-123` } }
  );
  return {
    statusCode: 200,
    body: JSON.stringify({ tool: "force_close_shifts", data: resp.data }),
  };
};
