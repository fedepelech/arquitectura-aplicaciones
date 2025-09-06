const axios = require("axios");
exports.handler = async (event) => {
  const { businessDay } = JSON.parse(event.body || event);
  const resp = await axios.get(
    `http://restaurant-api:3000/api/sales/${businessDay}`,
    { headers: { Authorization: `Bearer local-key-123` } }
  );
  return {
    statusCode: 200,
    body: JSON.stringify({ tool: "get_sales_data", data: resp.data }),
  };
};
