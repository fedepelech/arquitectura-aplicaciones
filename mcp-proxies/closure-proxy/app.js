const axios = require("axios");
exports.handler = async (event) => {
  const body = JSON.parse(event.body || event);
  const businessDay = body.businessDay || 'today';
  const resp = await axios.get(
    `http://restaurant-api:3000/api/closure-status/${businessDay}`,
    { headers: { Authorization: `Bearer local-key-123` } }
  );
  // Asegura que el formato sea el esperado por el frontend
  return {
    statusCode: 200,
    body: JSON.stringify({
      tool: "check_closure_status",
      data: {
        summary: resp.data.summary,
        details: resp.data.details,
        businessDate: resp.data.businessDate,
        timestamp: resp.data.metadata?.timestamp || resp.data.timestamp
      }
    }),
  };
};
