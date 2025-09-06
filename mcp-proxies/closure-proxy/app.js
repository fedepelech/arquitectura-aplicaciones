const axios = require("axios");
exports.handler = async (event) => {
  const { localId, businessDay } = JSON.parse(event.body || event);
  const resp = await axios.get(
    `http://restaurant-api:3000/api/closure-status/${businessDay}`,
    { headers: { Authorization: `Bearer local-key-123` } }
  );
  return {
    statusCode: 200,
    body: JSON.stringify({ tool: "check_closure_status", data: resp.data }),
  };
};
