/**
 * main.js – 정육면체 전개도/겹침 통합 최신 버전 (Babylon.js 대응 수정)
 * - 전개도 완성하기
 * - 겹쳐지는 부분 찾기
 * - ui.js / validator.js / foldEngine.js / overlap.js 와 연동
 */

(function () {
    "use strict";

    window.CubeProject = {};

    const MAIN_MODE = {
        NET_BUILD: "netBuild",
        OVERLAP_FIND: "overlapFind"
    };
    window.CubeProject.MAIN_MODE = MAIN_MODE;

    const OVERLAP_MODE = { POINT: "point", EDGE: "edge", BOTH: "both" };
    const RUN_MODE = { PRACTICE: "practice", REAL: "real" };

    let mainMode = null;
    let overlapMode = OVERLAP_MODE.BOTH;

    let runMode = RUN_MODE.PRACTICE;
    let problemCount = 10;

    let problems = [];
    let currentIndex = 0;
    let currentProblem = null;
    window.CubeProject.currentProblem = currentProblem;

    let netCanvas, threeCanvas;

    // Babylon 엔진/씬 전역 참조
    let engine = null;
    let scene = null;

    // ------------------------------------------------
    // 초기화
    // ------------------------------------------------
    document.addEventListener("DOMContentLoaded", init);

    function init() {
        netCanvas = document.getElementById("net-canvas");
        threeCanvas = document.getElementById("three-view");

        // Babylon 엔진 + Scene 생성 후 FoldEngine 초기화
        if (typeof BABYLON !== "undefined" && typeof FoldEngine !== "undefined") {
            try {
                engine = new BABYLON.Engine(threeCanvas, true);
                scene = new BABYLON.Scene(engine);

                // ⭐ FoldEngine을 Babylon 환경으로 초기화
                FoldEngine.init(threeCanvas, engine, scene); 

                window.addEventListener("resize", () => {
                    if (engine) {
                        engine.resize();
                    }
                    if (FoldEngine.onResize) {
                        FoldEngine.onResize();
                    }
                });
            } catch (e) {
                console.error("FoldEngine.init 실패: Babylon.js 초기화 문제.", e);
            }
        } else {
            console.error("BABYLON 또는 FoldEngine이 정의되지 않았습니다. 스크립트 로드 순서를 확인하세요.");
        }

        bindModeSelectPage();
        bindNetSetupPage();
        bindOverlapSetupPage();
        bindProblemButtons();
        bindQRPopup();

        // ⭐ 추가: 슬라이더 이벤트 바인딩
        bindFoldSlider();

        // 기본 선택 상태
        document
            .querySelector("#net-run-group button[data-run='practice']")
            .classList.add("selected");
        document
            .querySelector("#ov-type-group button[data-type='both']")
            .classList.add("selected");
        document
            .querySelector("#ov-run-group button[data-run='practice']")
            .classList.add("selected");

        showPage("mode-select-page");
        
        // ⭐ 추가: 슬라이더 제어판 초기 숨김
        document.getElementById("fold-control").classList.add("hidden");
    }

    // ------------------------------------------------
    // 페이지 전환
    // ------------------------------------------------
    function showPage(pageId) {
        const pages = [
            "mode-select-page",
            "setup-net",
            "setup-overlap",
            "problem-page",
            "result-page"
        ];

        pages.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add("hidden");
        });

        const target = document.getElementById(pageId);
        if (target) target.classList.remove("hidden");
        
        // ⭐ 슬라이더 제어판 표시/숨김 관리
        if (pageId === "problem-page") {
             document.getElementById("fold-control").classList.remove("hidden");
        } else {
             document.getElementById("fold-control").classList.add("hidden");
        }
    }

    // ------------------------------------------------
    // 모드 선택 화면
    // ------------------------------------------------
    function bindModeSelectPage() {
        document.getElementById("btn-mode-net").addEventListener("click", () => {
            mainMode = MAIN_MODE.NET_BUILD;
            showPage("setup-net");
        });

        document.getElementById("btn-mode-overlap").addEventListener("click", () => {
            mainMode = MAIN_MODE.OVERLAP_FIND;
            showPage("setup-overlap");
        });
    }

    // ------------------------------------------------
    // 전개도 완성하기 설정
    // ------------------------------------------------
    function bindNetSetupPage() {
        // 연습 / 실전 선택
        document.querySelectorAll("#net-run-group button").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll("#net-run-group button")
                    .forEach(b => b.classList.remove("selected"));
                btn.classList.add("selected");
                runMode = btn.dataset.run;
            });
        });

        // 문항 수 조절
        const disp = document.getElementById("net-q-display");
        document.getElementById("net-q-minus").addEventListener("click", () => {
            problemCount = Math.max(1, problemCount - 1);
            disp.textContent = problemCount;
        });
        document.getElementById("net-q-plus").addEventListener("click", () => {
            problemCount = Math.min(50, problemCount + 1);
            disp.textContent = problemCount;
        });

        // 시작 버튼
        document.getElementById("start-net").addEventListener("click", startNetProblems);
    }

    // ------------------------------------------------
    // 겹침 찾기 설정
    // ------------------------------------------------
    function bindOverlapSetupPage() {
        // 점/선/둘 다
        document.querySelectorAll("#ov-type-group button").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll("#ov-type-group button")
                    .forEach(b => b.classList.remove("selected"));
                btn.classList.add("selected");
                overlapMode = btn.dataset.type;
            });
        });

        // 연습 / 실전
        document.querySelectorAll("#ov-run-group button").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll("#ov-run-group button")
                    .forEach(b => b.classList.remove("selected"));
                btn.classList.add("selected");
                runMode = btn.dataset.run;
            });
        });

        // 문항 수
        const disp = document.getElementById("ov-q-display");
        document.getElementById("ov-q-minus").addEventListener("click", () => {
            problemCount = Math.max(1, problemCount - 1);
            disp.textContent = problemCount;
        });
        document.getElementById("ov-q-plus").addEventListener("click", () => {
            problemCount = Math.min(50, problemCount + 1);
            disp.textContent = problemCount;
        });

        // 시작 버튼
        document.getElementById("start-overlap").addEventListener("click", startOverlapProblems);
    }

    // ------------------------------------------------
    // 문제 생성 함수들
    // ------------------------------------------------
    function generateOneNetProblem() {
        const p = CubeNets.getRandomPieceProblem();
        return {
            mode: MAIN_MODE.NET_BUILD,
            solid: "cube",
            net: p.net
        };
    }

    function generateOneOverlapProblem() {
        const netObj = CubeNets.getRandomOverlapProblem(overlapMode);
        return {
            mode: MAIN_MODE.OVERLAP_FIND,
            solid: "cube",
            net: netObj.net,
            overlapMode: overlapMode
        };
    }

    // ------------------------------------------------
    // 모드별 시작
    // ------------------------------------------------
    function startNetProblems() {
        problems = [];
        for (let i = 0; i < problemCount; i++) {
            problems.push(generateOneNetProblem());
        }
        currentIndex = 0;
        showPage("problem-page");
        loadProblem();
    }

    function startOverlapProblems() {
        problems = [];
        for (let i = 0; i < problemCount; i++) {
            problems.push(generateOneOverlapProblem());
        }
        currentIndex = 0;
        showPage("problem-page");
        loadProblem();
    }

    // ------------------------------------------------
    // 문제 로딩
    // ------------------------------------------------
    async function loadProblem() {
        currentProblem = problems[currentIndex];
        window.CubeProject.currentProblem = currentProblem;

        if (!currentProblem) {
            showResultPage();
            return;
        }

        // 버튼 상태
        const btnNext = document.getElementById("btn-next");
        const btnCheck = document.getElementById("btn-check");
        btnNext.classList.add("hidden");
        btnCheck.classList.remove("hidden");
        btnCheck.disabled = false;
        
        // ⭐ 슬라이더 초기화
        const foldSlider = document.getElementById('fold-slider');
        foldSlider.value = 0;
        document.getElementById('slider-value').textContent = '0.00';
        foldSlider.disabled = false;


        // 제목
        const title = document.getElementById("problem-title");
        const idx = currentIndex + 1;

        if (currentProblem.mode === MAIN_MODE.NET_BUILD) {
            title.textContent = `전개도 완성하기 (${idx}/${problemCount})`;
        } else {
            title.textContent = `겹쳐지는 부분 찾기 (${idx}/${problemCount})`;
        }

        // 2D 전개도 초기화 / 렌더
        UI.init(netCanvas);
        UI.clear();

        const opt = {};
        if (currentProblem.mode === MAIN_MODE.NET_BUILD) {
            opt.highlightPositions = true;
        }
        UI.renderNet(currentProblem.net, opt);

        // 3D 전개도용 데이터 준비
        const netFor3D = JSON.parse(JSON.stringify(currentProblem.net));

        // ⭐ 전개도 완성 모드에서는 "빠진 조각"을 3D에서 투명 처리
        if (currentProblem.mode === MAIN_MODE.NET_BUILD && window.UI && UI.getRemovedFaceId) {
            const removedId = UI.getRemovedFaceId();
            netFor3D.faces.forEach(f => {
                if (f.id === removedId) {
                    f._hidden = true;  // FoldEngine이 이 face를 투명 처리하게 함
                }
            });
        }

        await FoldEngine.loadNet(netFor3D);
        FoldEngine.unfoldImmediate(); // 초기 상태: 펼침

        // 겹침 모드라면 선택 초기화
        if (currentProblem.mode === MAIN_MODE.OVERLAP_FIND) {
            Overlap.startSelection(currentProblem.net);
        }
    }


    // ------------------------------------------------
    // ⭐ 슬라이더 제어 로직
    // ------------------------------------------------
    function bindFoldSlider() {
        const foldSlider = document.getElementById('fold-slider');
        const sliderValueSpan = document.getElementById('slider-value');

        foldSlider.addEventListener('input', () => {
            const progress = parseFloat(foldSlider.value);
            sliderValueSpan.textContent = progress.toFixed(2);
            
            // 핵심: FoldEngine의 foldTo 함수로 3D 모델 실시간 제어
            if (typeof FoldEngine.foldTo === 'function') {
                FoldEngine.foldTo(progress); 
            }
        });
    }

    // ------------------------------------------------
    // 정답 확인 / 다음 / 종료 버튼
    // ------------------------------------------------
    function bindProblemButtons() {
        // 정답 확인
        document.getElementById("btn-check").addEventListener("click", async () => {
            const btnCheck = document.getElementById("btn-check");
            btnCheck.disabled = true;
            document.getElementById('fold-slider').disabled = true; // 슬라이더 비활성화

            let correct = false;
            let netForFold = currentProblem.net;

            if (currentProblem.mode === MAIN_MODE.NET_BUILD) {
                const placedPos = window.UI.placed;
                if (!placedPos) {
                    alert("조각이 배치되지 않았습니다.");
                    btnCheck.disabled = false;
                    document.getElementById('fold-slider').disabled = false; 
                    return;
                }

                // 학생이 놓은 위치를 반영한 6면 전개도 구성
                netForFold = JSON.parse(JSON.stringify(currentProblem.net));
                const removedId = window.UI.getRemovedFaceId();

                let f = netForFold.faces.find(x => x.id === removedId);
                if (f) {
                    f.u = placedPos.u;
                    f.v = placedPos.v;
                    f.w = placedPos.w;
                    f.h = placedPos.h;
                } else {
                    netForFold.faces.push({
                        id: removedId,
                        u: placedPos.u,
                        v: placedPos.v,
                        w: placedPos.w,
                        h: placedPos.h,
                        color: placedPos.color || "#FFD54F"
                    });
                    netForFold.faces.sort((a, b) => a.id - b.id);
                }

                // 3D로 로드 후 검증
                await FoldEngine.loadNet(netForFold); // 정답 후보 전개도로 3D 뷰 업데이트
                correct = Validator.validateNet(netForFold);

            } else {
                // 겹침 찾기 모드
                await FoldEngine.loadNet(netForFold);
                correct = window.Overlap.checkUserAnswer(netForFold);
            }

            // ⭐ 애니메이션 로직 수정: 슬라이더를 1로 설정하고 검증 결과에 따라 처리합니다.
            
            // 정답/오답에 관계없이 최종 접힌 모양을 보여줍니다.
            FoldEngine.foldImmediate(); // 3D를 완전히 접힌 상태(t=1)로 즉시 변경
            document.getElementById('fold-slider').value = 1.0;
            document.getElementById('slider-value').textContent = '1.00';
            
            // 잠깐의 딜레이 후 결과 메시지 표시
            setTimeout(() => {
                if (correct) {
                    alert("정답입니다! 🎉 3D 큐브를 돌려보세요!");
                    btnCheck.classList.add("hidden");
                    document.getElementById("btn-next").classList.remove("hidden");
                    document.getElementById('fold-slider').disabled = false; // 정답 후 재활성화
                } else {
                    alert("다시 생각해 볼까요? 🤔 큐브를 펼쳐보며 확인해 보세요.");
                    
                    document.getElementById('fold-slider').disabled = false; // 오답 후 재활성화
                    btnCheck.disabled = false;
                    
                    // 1.5초 후 2D 펼침 상태로 복귀
                    setTimeout(() => {
                        FoldEngine.unfoldImmediate();
                        document.getElementById('fold-slider').value = 0.0;
                        document.getElementById('slider-value').textContent = '0.00';

                        // 2D 캔버스 상태 복구
                        if (currentProblem.mode === MAIN_MODE.OVERLAP_FIND) {
                            Overlap.startSelection(currentProblem.net);
                            UI.renderNet(currentProblem.net, {});
                        } else {
                            UI.renderNet(currentProblem.net, { highlightPositions: true });
                        }
                    }, 1500);
                }
            }, 50);
        });

        // 다음 문제
        document.getElementById("btn-next").addEventListener("click", () => {
            currentIndex++;
            if (currentIndex >= problemCount) {
                showResultPage();
            } else {
                loadProblem();
            }
        });

        // 종료
        document.getElementById("btn-exit").addEventListener("click", () => {
            if (confirm("처음 화면으로 돌아갈까요?")) {
                showPage("mode-select-page");
            }
        });
    }

    // ------------------------------------------------
    // 결과 페이지
    // ------------------------------------------------
    function showResultPage() {
        const correctCount = currentIndex; // 추후 정답 개수 별도 집계 가능

        showPage("result-page");
        document.getElementById("result-acc").textContent =
            `${((correctCount / problemCount) * 100).toFixed(1)}%`;

        document.getElementById("btn-restart").onclick = () => {
            showPage("mode-select-page");
        };
    }

    // ------------------------------------------------
    // QR 팝업
    // ------------------------------------------------
    function bindQRPopup() {
        document.getElementById("qr-btn").addEventListener("click", () => {
            document.getElementById("qr-popup").style.display = "flex";
            const holder = document.getElementById("qr-holder");
            holder.innerHTML = "";
            new QRCode(holder, {
                text: "https://cube.3arch2nd.site",
                width: 180,
                height: 180
            });
        });

        document.getElementById("qr-close").addEventListener("click", () => {
            document.getElementById("qr-popup").style.display = "none";
        });
    }

})();
