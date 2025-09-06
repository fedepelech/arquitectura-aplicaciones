# Comandos para comprimir cada uno de los proxies.
aws --endpoint-url=http://localhost:4566 lambda create-function \
  --region us-east-1 \
  --function-name closureStatusProxy \
  --runtime nodejs18.x \
  --handler app.handler \
  --zip-file fileb://comprimidos/closure-proxy.zip \
  --role arn:aws:iam::000000000000:role/lambda-role

aws --endpoint-url=http://localhost:4566 lambda create-function \
  --region us-east-1 \
  --function-name salesDataProxy \
  --runtime nodejs18.x \
  --handler app.handler \
  --zip-file fileb://comprimidos/sales-proxy.zip \
  --role arn:aws:iam::000000000000:role/lambda-role
  
  aws --endpoint-url=http://localhost:4566 lambda create-function \
  --region us-east-1 \
  --function-name logsProxy \
  --runtime nodejs18.x \
  --handler app.handler \
  --zip-file fileb://comprimidos/logs-proxy.zip \
  --role arn:aws:iam::000000000000:role/lambda-role
  
  aws --endpoint-url=http://localhost:4566 lambda create-function \
  --region us-east-1 \
  --function-name processTransactionsProxy \
  --runtime nodejs18.x \
  --handler app.handler \
  --zip-file fileb://comprimidos/process-transactions-proxy.zip \
  --role arn:aws:iam::000000000000:role/lambda-role
  
  aws --endpoint-url=http://localhost:4566 lambda create-function \
  --region us-east-1 \
  --function-name closeShiftsProxy \
  --runtime nodejs18.x \
  --handler app.handler \
  --zip-file fileb://comprimidos/close-shifts-proxy.zip \
  --role arn:aws:iam::000000000000:role/lambda-role
  