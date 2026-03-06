echo "=== API ==="
curl -s "$BASE/v1/runs/worker-status" -H "X-PDR-API-KEY: $PDR_API_KEY" | jq .

echo
echo "=== WORKER ==="
pm2 list

echo
echo "=== DB ==="
mysql -h 127.0.0.1 -u pdr_local -p -D pdr_api_dev -e "
SELECT DATABASE() db, USER() user, @@hostname host, @@port port;
"

echo
echo "=== QUEUE ==="
mysql -h 127.0.0.1 -u pdr_local -p -D pdr_api_dev -e "
SELECT status, COUNT(*) cnt FROM runs GROUP BY status;
"