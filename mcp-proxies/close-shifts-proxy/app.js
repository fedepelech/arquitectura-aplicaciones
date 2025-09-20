const axios = require("axios");
exports.handler = async (event) => {
  const monolitoUrl = process.env.MONOLITO_URL || 'http://monolito:3000';
  const resp = await axios.post(
    `${monolitoUrl}/api/admin/force-close-shifts`,
    null,
    { headers: { Authorization: `Bearer local-key-123` } }
  );
  return {
    statusCode: 200,
    body: JSON.stringify({ tool: "force_close_shifts", data: resp.data }),
  };
};
