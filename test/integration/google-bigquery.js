const {BigQuery} = require('@google-cloud/bigquery');

module.exports = () => {
  const bigquery = new BigQuery({
    projectId: 'PROJECT_ID',
  });
}
