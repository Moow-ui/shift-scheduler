## 알바앤보스 운영 규칙

### 저장소 → 배포 주소
- 포털: Moow-ui/albaNboss → https://albanboss.com (M2 전까지는 https://albanboss.moow-ui.workers.dev. M2 뒤에는 옛 주소가 새 주소로 자동 이동)
  · 사장님 시급 계산기는 포털 안 /wage/ (계산 엔진 assets/js/wage-core.js)
  · 사이트 주소가 필요한 스크립트는 data/site.json의 site_url 한 곳에서만 읽는다
- 근무표 완성기: Moow-ui/shift-scheduler → https://shift-scheduler.moow-ui.workers.dev (주소 이전은 P8 설계 뒤)
- 알바 급여 계산기: Moow-ui/shift-calculator → https://shift-calculator.moow-ui.workers.dev (주소 이전은 P8 설계 뒤)
- 보관용: Moow-ui/paycalculator → 포털 /wage/로 자동 이동하는 옛 주소. 사장님 시급 계산기 수정은 포털에서만
- 본부(비공개): Moow-ui/albaboss-hq — 주간 보고서, ROADMAP, 지시서 보관. mirror/ 안은 읽기만

배포 방식: main 브랜치에 push하면 Cloudflare가 자동 배포

### 데이터 파일
- 포털 data/*.json은 맨 위에 설명 주석이 있는 형식이다. 페이지와 같은 방식(주석 제거 후 해석)으로 읽고, 주석과 기존 필드는 지우지 않는다.
- 법적 기준값(최저시급·보험요율)의 원본은 data/standards.json 하나다.

### 일하는 방식 (대표는 코딩을 모르고, 할 일은 최소로 한다)
1. 기존 계산·근무 배정 로직은 수정 금지. 요율·공휴일 같은 '값'은 지시서가 명시한 경우에만 바꾼다.
2. 단계는 순서대로 하나씩 한다. 단계마다 스스로 확인하고, 통과하면 멈추지 말고 다음 단계로 간다.
3. 대표에게 멈추고 묻는 경우는 네 가지뿐이다: ① 돈이 드는 일 ② 대표 계정으로 로그인·가입·등록해야 하는 일 ③ 확인이 실패했거나 되돌리기 어려운 일 ④ 지시서에 [대표 결정]이라고 적힌 곳. 그 밖의 세부 선택은 추천안대로 정하고 마지막 보고에 적는다.
4. 시작할 때 main을 GitHub 최신으로 받는다(git pull). 작업 브랜치(예: feat/1010-작업명)에서 작업하고, 검증 체크리스트가 모두 통과하면 main에 병합·push까지 한다. 하나라도 실패하면 병합하지 않고 멈춘다. 문제가 생기면 git revert로 되돌린다. 강제 push와 git reset --hard는 쓰지 않는다.
5. 콘텐츠는 JSON 데이터 파일로 관리하는 구조를 유지한다. 내용이 없는 섹션은 빈칸 대신 숨긴다.
6. 필요한 명령은 scripts/ 폴더(또는 배포되지 않는 .claude/scripts/)에 파일로 만들어 실행한다. 여러 줄짜리 인라인 실행은 하지 않는다.
7. 작업이 끝나면 해당 저장소 CHANGELOG.md에 오늘 날짜로 기록한다.
8. 커밋 메시지는 한국어로 쓰되 UTF-8 파일(.claude/tmp/commit-msg.txt)에 적어 git commit -F로 올린다. 작성자는 이 저장소 설정(Moow-ui)을 쓴다.
9. 안티그래비티 파일(AGENTS.md, .agents/, .agent/)은 지우지 않는다. 규칙·워크플로의 원본이므로, 지시서가 고치라고 한 경우에만 .agents/ 쪽을 고친다. .agent/는 고치지 않는다(12월 회의에서 정리 여부 결정).
10. API 키·토큰 같은 비밀값은 환경변수로만 다루고 채팅·파일·커밋에 쓰지 않는다.
11. 마지막에 한 번만 보고한다: [한 일 3줄 / 검증 결과표 / 대표가 할 일 — 없으면 '없음']. 비개발자가 이해할 수 있는 한국어로.

## 이 저장소
- 역할: 근무표 완성기(shift-scheduler). 사장님이 근무자·근무 시간을 넣으면 근무표를 자동으로 짜 주는 한 페이지 도구.
- 배포: main에 push하면 Cloudflare가 저장소 폴더를 그대로 배포한다. 사이트에 올리지 않을 파일은 .assetsignore에 적는다.
- 수정 금지 파일: index.html 안의 근무 배정 코드(generateSchedule, simulateScheduleOnce, rebuildScheduleWithRequests 등)
- 테스트 명령: 없음
