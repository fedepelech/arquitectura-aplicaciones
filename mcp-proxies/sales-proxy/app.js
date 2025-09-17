const axios = require("axios");
exports.handler = async (event) => {
  const body = JSON.parse(event.body || event);
  const businessDay = body.businessDay || 'today';
  const resp = await axios.get(
    `http://restaurant-api:3000/api/sales/${businessDay}`,
    { headers: { Authorization: `Bearer local-key-123` } }
  );
  return {
    statusCode: 200,
    body: JSON.stringify({
      tool: "get_sales_data",
      data: {
        summary: resp.data.summary,
        byPos: resp.data.byPos,
        businessDate: resp.data.businessDate,
        timestamp: resp.data.timestamp
      }
    }),
  };
};
