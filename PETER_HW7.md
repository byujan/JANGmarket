# HW7 인수인계 메모 (Hendrick → Peter)

작성일: 2026-11-03 (화). **마감: 2026-11-04 (수) 11:59 PM ET.** Canvas에는 팀에서 한 명이 PDF를 업로드하면 됩니다.
브랜치: `hendrick/hw7-benchmark` (로컬 커밋만 있고 **push는 아직 안 했습니다**).

## 1. 지금 상태 (한 줄 요약)

실험은 전부 끝났고, 보고서 초안(3쪽 PDF)도 완성돼 있습니다. 남은 것은 **Peter가 하는 일 4가지**(아래 3번)뿐입니다.

## 2. Hendrick이 한 일

- 벤치마크 하니스: 시장 생성기 4종, price-only 기준선, 전수 탐색 정답(feasible, Pareto, efficiency) (`scripts/hw7/lib.ts`, `run.ts`, `summarize.ts`)
- 프로토콜(주장, 조건, 판정 기준, 시드)을 결과를 보기 전에 커밋 (`docs/hw7/protocol.md`, 커밋 `62e6800`)
- 규칙 에이전트 실험: 시드 3개 x 변형 6개, 총 5,040건 협상. 새 시드 결과는 `ee52691`
- 튜닝 시드에서 원인을 찾아 변경 하나("fix", 자기 mandate 밖의 패키지는 수락하지 않기)를 만들고 새 시드 2개에서 재시험
- Claude 에이전트 실험 (`scripts/hw7/llm.ts`): 총 60건, 비용 $84.08(API 환산), 약 60분
- 재현 확인: `npm run hw7:all`을 다시 돌려 결과 파일 18개가 시간과 메타데이터를 빼면 똑같음을 확인
- `npm test`(36개 통과), `npm run typecheck`(에러 없음) 확인
- 보고서 초안: `docs/hw7/HW7_report.md`, `docs/hw7/HW7_report.pdf` (Claude Code의 도움을 받아 작성, 숫자는 모두 `results/hw7/`에서 가져옴)

핵심 커밋: `62e6800`(프로토콜), `ee52691`(새 시드 결과), `0b0ba0d`(Claude 배치 완료와 최종 요약), `2a6a064`와 `043cc02`(보고서와 PDF)

## 3. Peter가 해야 할 일

1. **PDF 읽고 확인하기.** `docs/hw7/HW7_report.pdf`. 틀린 문장이나 고치고 싶은 해석이 있으면 `docs/hw7/HW7_report.md`를 고치면 됩니다. 숫자를 바꿀 때는 `results/hw7/SUMMARY.md`와 맞는지 확인하세요.
2. **6번 섹션 "Team and contributions" 채우기.** 지금은 `[To be written by Hendrick Jung and Peter Jang.]`라는 자리표시자뿐입니다. 두 사람이 각자 무엇을 했는지 구체적으로 적으세요.
3. **저장소 공개 설정 바꾸기.** 저장소 `github.com/byujan/JANGmarket`가 **PRIVATE**입니다. 채점자가 증거 링크를 열 수 없으니 둘 중 하나를 하세요. (a) public으로 전환하거나, (b) 채점자(교수·조교)에게 접근 권한을 줍니다. Hendrick 계정(`Hendrick-Jung`)은 이 저장소에 push 권한만 있고 admin 권한은 없어서, **공개 전환과 권한 부여는 저장소 소유자인 Peter만 할 수 있습니다.** `.env.local`(Clerk 비밀키)은 2026-11-03에 확인했을 때 모든 브랜치의 git 이력에 없었습니다(`git log --all -- .env.local` 결과 없음). 공개 직전에 한 번 더 확인하면 안전합니다.
4. **브랜치 받기.** 브랜치는 Hendrick이 같은 저장소(`byujan/JANGmarket`)로 push합니다(`git push -u origin hendrick/hw7-benchmark`). 보고서가 인용한 커밋(`62e6800`, `ee52691`, `0b0ba0d`)이 원격에 있어야 링크가 열리기 때문입니다. Hendrick이 push했다고 알려주면 Peter는 `git fetch origin && git checkout hendrick/hw7-benchmark`로 받아서 6번 섹션을 채우고, 같은 브랜치에 커밋하면 됩니다. 공개 후에는 보고서 7번 섹션에 저장소 URL을 한 줄 추가하면 좋습니다.

그다음 **PDF를 다시 만들고** Canvas에 업로드하세요(팀에서 한 명만 올리면 됩니다).

## 4. 수정한 뒤 PDF 다시 만드는 법

```
pip install markdown
python3 scripts/hw7/md2html.py docs/hw7/HW7_report.md /tmp/HW7_report.html
# macOS Chrome:
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --no-pdf-header-footer --print-to-pdf=docs/hw7/HW7_report.pdf file:///tmp/HW7_report.html
```

Chrome 명령이 안 되면 `/tmp/HW7_report.html`을 브라우저에서 열고 인쇄에서 PDF로 저장하세요(Letter, 머리글/바닥글 끄기). 3쪽을 넘기지 않는 것이 좋습니다(쪽 경계에서 제목이 표와 떨어지지 않는지 확인).
Claude Code로 같은 작업을 시켜도 됩니다. 먼저 `docs/hw7/HANDOFF.md`를 읽게 하세요.

## 5. 보고서가 주장하는 것과 주장하지 않는 것 (질문받을 때 대비)

- **주장 A (닫힘 비율):** 규칙 에이전트에서 성립합니다. ordinary 시장에서 JANG 47/58 대 price-only 31/58(fix 적용 후). 지원됨.
- **주장 C (공동 가치, 효율):** 규칙 에이전트에서는 **성립하지 않습니다.** price-only의 평균 효율이 비슷하거나 약간 높습니다. 부정적 결과로 그대로 보고했습니다.
- **Claude 에이전트:** JANG의 효율 평균이 더 높지만 n=3이고 편차가 커서 "방향"일 뿐 증거가 아니라고 적었습니다.
- **fix의 효과:** fix는 price-only에도 도움이 돼서 JANG의 우위가 줄었습니다. 즉 버그가 JANG의 우위를 부풀리고 있었습니다.

## 6. 반드시 알고 있어야 하는 사실 (보고서에 이미 적혀 있음)

1. **사후 변경.** Claude 에이전트 실험의 시장 선택 규칙을 첫 결과를 본 뒤에 바꿨습니다(ordinary와 asymmetric이 market #0에서 #2로). #0에서는 price-only가 구조적으로 닫을 수 없었기 때문입니다. #0 결과는 지우지 않고 별도 행으로 남겼습니다.
2. **중단된 run 16건** (60건 중). 15건은 구독의 5시간 사용 한도, 1건은 40턴 한도입니다. 전부 raw 파일에 남기고, 합의와 효율 통계에서는 빼고, 비용 합계에는 포함했습니다. 16건의 비용은 $1.93입니다.
3. **비용은 "API 환산"입니다.** 구독으로 돌려서 실제 청구액이 아니라 토큰 수에 공개 단가를 곱한 값입니다.
4. **market #2의 price-only 합의 6건은 모두 같은 패키지**(가격 1220, 배송 14일, 보증 12개월, 사운드바 없음)입니다. 이유를 확인하지 않았기 때문에 보고서는 사실만 적었습니다.
5. **저장소가 private이었다는 점**은 보고서 안에는 없고 이 메모에만 있습니다.

## 7. 하면 안 되는 것

- 새 시드 결과(`20261101`, `20261102`)를 "좋게 보이도록" 다시 돌리지 마세요. 프로토콜을 사후에 바꾸지도 마세요. 바꿨다면 반드시 보고서에 적어야 합니다.
- `.env.local`을 읽거나 출력하거나 커밋하지 마세요. `.DS_Store`, `.agents/`, `skills-lock.json`도 커밋하지 마세요.
- `respectBounds`와 `deadlineAware`의 기본값을 켜지 마세요(옵트인 유지).
- 보고서에 em dash(—)를 쓰지 마세요(문체 규칙).
- 증거가 뒷받침하는 것보다 더 세게 주장하지 마세요. 표본이 작다는 점과 실패한 부분은 그대로 둡니다.

## 8. 파일 위치

| 무엇 | 어디 |
| --- | --- |
| 보고서 (원문, PDF) | `docs/hw7/HW7_report.md`, `docs/hw7/HW7_report.pdf` |
| 프로토콜 (결과 보기 전에 커밋) | `docs/hw7/protocol.md` |
| 상세 인수인계 (Claude Code용) | `docs/hw7/HANDOFF.md` |
| 요약표 (모든 숫자의 출처) | `results/hw7/SUMMARY.md`, `results/hw7/summary.json` |
| 규칙 에이전트 원본 결과 18개 | `results/hw7/*-seed*.json` |
| Claude 에이전트 원본 결과 5개 | `results/hw7/llm-*.json` |
| PDF 변환 스크립트 | `scripts/hw7/md2html.py` |
