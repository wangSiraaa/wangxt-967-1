#!/usr/bin/env bash
set -euo pipefail

BASE="http://localhost:3001/api"
PASS=0
FAIL=0

check() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  ✅ $desc"
    PASS=$((PASS+1))
  else
    echo "  ❌ $desc (expected=$expected, actual=$actual)"
    FAIL=$((FAIL+1))
  fi
}

echo "=== 1. Admin Login ==="
RESULT=$(curl -s "$BASE/auth/login" -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}')
TOKEN=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
check "Admin login" "true" "$(echo "$RESULT" | python3 -c "import sys,json; print(str(json.load(sys.stdin)['success']).lower())")"

echo "=== 2. Create Batch ==="
RESULT=$(curl -s "$BASE/batches" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"2026Q2测试","stall_count":3,"stall_numbers":"[\"A1\",\"A2\",\"A3\"]","start_date":"2026-01-01","end_date":"2026-12-31"}')
BATCH_ID=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")
check "Create batch" "true" "$(echo "$RESULT" | python3 -c "import sys,json; print(str(json.load(sys.stdin)['success']).lower())")"

echo "=== 3. Merchant Register ==="
RESULT=$(curl -s "$BASE/auth/register" -H 'Content-Type: application/json' -d '{"username":"smoke_merchant","password":"test123","name":"测试商户","phone":"13900009999"}')
check "Merchant register" "true" "$(echo "$RESULT" | python3 -c "import sys,json; print(str(json.load(sys.stdin)['success']).lower())")"

echo "=== 4. Merchant Login ==="
RESULT=$(curl -s "$BASE/auth/login" -H 'Content-Type: application/json' -d '{"username":"smoke_merchant","password":"test123"}')
M_TOKEN=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
check "Merchant login" "true" "$(echo "$RESULT" | python3 -c "import sys,json; print(str(json.load(sys.stdin)['success']).lower())")"

echo "=== 5. Valid Registration ==="
RESULT=$(curl -s "$BASE/registrations" -H "Content-Type: application/json" -H "Authorization: Bearer $M_TOKEN" \
  -d "{\"batch_id\":$BATCH_ID,\"merchant_name\":\"测试商户\",\"contact_person\":\"张三\",\"phone\":\"13900009999\",\"category\":\"蔬菜\",\"license_no\":\"91110000MA01\",\"license_expiry\":\"2027-06-30\",\"license_image\":\"/api/upload/test.jpg\"}")
check "Valid registration" "true" "$(echo "$RESULT" | python3 -c "import sys,json; print(str(json.load(sys.stdin)['success']).lower())")"

echo "=== 6. Duplicate Registration (should fail) ==="
RESULT=$(curl -s "$BASE/registrations" -H "Content-Type: application/json" -H "Authorization: Bearer $M_TOKEN" \
  -d "{\"batch_id\":$BATCH_ID,\"merchant_name\":\"测试商户\",\"contact_person\":\"张三\",\"phone\":\"13900009999\",\"category\":\"蔬菜\",\"license_no\":\"91110000MA01\",\"license_expiry\":\"2027-06-30\",\"license_image\":\"/api/upload/test.jpg\"}")
check "Duplicate rejected" "false" "$(echo "$RESULT" | python3 -c "import sys,json; print(str(json.load(sys.stdin)['success']).lower())")"

echo "=== 7. Expired License (should fail) ==="
curl -s "$BASE/auth/register" -H 'Content-Type: application/json' -d '{"username":"smoke_expired","password":"test123","name":"过期商户","phone":"13900008888"}' > /dev/null
M2_TOKEN=$(curl -s "$BASE/auth/login" -H 'Content-Type: application/json' -d '{"username":"smoke_expired","password":"test123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
RESULT=$(curl -s "$BASE/registrations" -H "Content-Type: application/json" -H "Authorization: Bearer $M2_TOKEN" \
  -d "{\"batch_id\":$BATCH_ID,\"merchant_name\":\"过期商户\",\"contact_person\":\"李四\",\"phone\":\"13900008888\",\"category\":\"水果\",\"license_no\":\"91110000MA02\",\"license_expiry\":\"2020-01-01\",\"license_image\":\"/api/upload/test2.jpg\"}")
check "Expired license rejected" "false" "$(echo "$RESULT" | python3 -c "import sys,json; print(str(json.load(sys.stdin)['success']).lower())")"

echo "=== 8. Approve Registration ==="
REG_ID=$(curl -s "$BASE/registrations?batch_id=$BATCH_ID" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'][0]['id'])")
RESULT=$(curl -s "$BASE/registrations/$REG_ID/status" -X PUT -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{"status":"approved"}')
check "Approve registration" "approved" "$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['status'])")"

echo "=== 9. Close Batch ==="
RESULT=$(curl -s "$BASE/batches/$BATCH_ID" -X PUT -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{"status":"closed"}')
check "Close batch" "closed" "$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['status'])")"

echo "=== 10. Execute Lottery ==="
RESULT=$(curl -s "$BASE/lottery/execute/$BATCH_ID" -X POST -H "Authorization: Bearer $TOKEN")
check "Lottery executed" "1" "$(echo "$RESULT" | python3 -c "import sys,json; print(str(len(json.load(sys.stdin)['data'])))")"

echo "=== 11. Publish Results ==="
RESULT=$(curl -s "$BASE/lottery/publish/$BATCH_ID" -X POST -H "Authorization: Bearer $TOKEN")
check "Publish results" "true" "$(echo "$RESULT" | python3 -c "import sys,json; print(str(json.load(sys.stdin)['success']).lower())")"

echo "=== 12. Modify After Publish (should fail) ==="
RESULT=$(curl -s "$BASE/lottery/execute/$BATCH_ID" -X POST -H "Authorization: Bearer $TOKEN")
check "Published result immutable" "false" "$(echo "$RESULT" | python3 -c "import sys,json; print(str(json.load(sys.stdin)['success']).lower())")"

echo ""
echo "=============================="
echo "  PASSED: $PASS  FAILED: $FAIL"
echo "=============================="
[ "$FAIL" -eq 0 ] && echo "  🎉 ALL TESTS PASSED!" || echo "  ⚠️  SOME TESTS FAILED"
