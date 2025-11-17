/**
 * main.js – 완전 통합 버전 (전개도 + 겹침 찾기 / cube + rect / point + edge)
 */

(function () {
    "use strict";

    // ------------------------------------------------------
    // ENUMS (UI.js에서 접근 가능하도록 window에 등록)
    // ------------------------------------------------------
    const MAIN_MODE = {
        NET_BUILD: "netBuild",
        OVERLAP_FIND: "overlapFind"
    };
    window.MAIN_MODE = MAIN_MODE; // UI.js에서 사용하기 위해 노출

    const NET_TYPE = { CUBE: "cube", RECT: "rect", BOTH: "both" };

    // 겹침 모드 – 입체 종류
    const SOLID_TYPE = { CUBE: "cube", RECT: "rect", BOTH: "both" };

    // 겹침 모드 – 유형(점/선/둘다)
    const OVERLAP_MODE = { POINT: "point", EDGE: "edge", BOTH: "both" };

    const RUN_MODE = { PRACTICE: "practice", REAL: "real" };

    // ------------------------------------------------------
    // 상태 변수
    // ------------------------------------------------------
    let mainMode = null;

    // 전개도
    let netType = NET_TYPE.CUBE;

    // 겹침 찾기
    let overlapSolid = SOLID_TYPE.CUBE;
    let overlapMode = OVERLAP_MODE.POINT;

    let runMode = RUN_MODE.PRACTICE;
    let problemCount = 10;

    let problems = [];
    let currentIndex = 0;
    let currentProblem = null;
    window.currentProblem = currentProblem; // UI.js에서 사용하기 위해 노출

    let netCanvas, threeCanvas;

    // ------------------------------------------------------
    document.addEventListener("DOMContentLoaded", init);

    function init() {
        netCanvas = document.getElementById("net-canvas");
        threeCanvas = document.getElementById("three-view");

        bindModeSelectPage();
        bindNetSetupPage();
        bindOverlapSetupPage();
        bindProblemButtons();
        bindQRPopup();

        // 초기 선택 버튼 selected 상태 지정
        document.querySelector("#net-type-group button[data-type='cube']").classList.add("selected");
        document.querySelector("#net-run-group button[data-run='practice']").classList.add("selected");
        document.querySelector("#ov-solid-group button[data-solid='cube']").classList.add("selected");
        document.querySelector("#ov-type-group button[data-type='point']").classList.add("selected");
        document.querySelector("#ov-run-group button[data-run='practice']").classList.add("selected");
        
        showPage("mode-select-page");
    }

    // ------------------------------------------------------
    // PAGE SWITCH
    // ------------------------------------------------------
    function showPage(pageId) {
        const pages = [
            "mode-select-page",
            "setup-net",
            "setup-overlap",
            "problem-page",
            "result-page"
        ];

        pages.forEach(id => document.getElementById(id).classList.add("hidden"));
        document.getElementById(pageId).classList.remove("hidden");
    }

    // ------------------------------------------------------
    // MODE SELECT PAGE
    // ------------------------------------------------------
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

    // ------------------------------------------------------
    // NET BUILD SETUP PAGE
    // ------------------------------------------------------
    function bindNetSetupPage() {

        document.querySelectorAll("#net-type-group button").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll("#net-type-group button")
                    .forEach(b => b.classList.remove("selected"));
                btn.classList.add("selected");
                netType = btn.dataset.type;
            });
        });

        document.querySelectorAll("#net-run-group button").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll("#net-run-group button")
                    .forEach(b => b.classList.remove("selected"));
                btn.classList.add("selected");
                runMode = btn.dataset.run;
            });
        });

        const disp = document.getElementById("net-q-display");
        document.getElementById("net-q-minus").addEventListener("click", () => {
            problemCount = Math.max(1, problemCount - 1);
            disp.textContent = problemCount;
        });
        document.getElementById("net-q-plus").addEventListener("click", () => {
            problemCount = Math.min(50, problemCount + 1);
            disp.textContent = problemCount;
        });

        document.getElementById("start-net").addEventListener("click", startNetProblems);
    }

    // ------------------------------------------------------
    // OVERLAP SETUP PAGE (new version)
    // ------------------------------------------------------
    function bindOverlapSetupPage() {

        // (1) 입체 종류
        document.querySelectorAll("#ov-solid-group button").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll("#ov-solid-group button")
                    .forEach(b => b.classList.remove("selected"));
                btn.classList.add("selected");

                overlapSolid = btn.dataset.solid;
            });
        });

        // (2) 겹침 유형
        document.querySelectorAll("#ov-type-group button").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll("#ov-type-group button")
                    .forEach(b => b.classList.remove("selected"));
                btn.classList.add("selected");

                overlapMode = btn.dataset.type;
            });
        });

        // run mode
        document.querySelectorAll("#ov-run-group button").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll("#ov-run-group button")
                    .forEach(b => b.classList.remove("selected"));
                btn.classList.add("selected");
                runMode = btn.dataset.run;
            });
        });

        const disp = document.getElementById("ov-q-display");
        document.getElementById("ov-q-minus").addEventListener("click", () => {
            problemCount = Math.max(1, problemCount - 1);
            disp.textContent = problemCount;
        });
        document.getElementById("ov-q-plus").addEventListener("click", () => {
            problemCount = Math.min(50, problemCount + 1);
            disp.textContent = problemCount;
        });

        document.getElementById("start-overlap").addEventListener("click", startOverlapProblems);
    }

    // ------------------------------------------------------
    // PROBLEM GENERATION
    // ------------------------------------------------------

    /** 1) 전개도 문제 생성 */
    function generateOneNetProblem() {

        if (netType === NET_TYPE.CUBE) {
            const p = CubeNets.getRandomPieceProblem();
            return {
                mode: MAIN_MODE.NET_BUILD,
                solid: "cube",
                net: p.net,
                dims: null
            };
        }

        if (netType === NET_TYPE.RECT) {
            const r = RectPrismNets.getRandomRectNet();
            return {
                mode: MAIN_MODE.NET_BUILD,
                solid: "rect",
                net: r.net,
                dims: r.dims
            };
        }

        // BOTH
        if (Math.random() < 0.5) {
            const p = CubeNets.getRandomPieceProblem();
            return { mode:MAIN_MODE.NET_BUILD, solid:"cube", net:p.net, dims:null };
        } else {
            const r = RectPrismNets.getRandomRectNet();
            return { mode:MAIN_MODE.NET_BUILD, solid:"rect", net:r.net, dims:r.dims };
        }
    }

    /** 2) 겹침 문제 생성 */
    function generateOneOverlapProblem() {

        let netObj;

        // (1) 입체 선택
        if (overlapSolid === SOLID_TYPE.CUBE) {
            netObj = CubeNets.getRandomOverlapProblem();
        } else if (overlapSolid === SOLID_TYPE.RECT) {
            netObj = RectPrismNets.getRandomRectOverlapProblem();
        } else {
            // BOTH
            if (Math.random() < 0.5)
                netObj = CubeNets.getRandomOverlapProblem();
            else
                netObj = RectPrismNets.getRandomRectOverlapProblem();
        }

        return {
            mode: MAIN_MODE.OVERLAP_FIND,
            solid: (netObj.dims ? "rect" : "cube"),
            net: netObj.net,
            dims: netObj.dims,
            overlapMode: overlapMode
        };
    }

    // ------------------------------------------------------
    // START
    // ------------------------------------------------------
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

    // ------------------------------------------------------
    // LOAD 1 PROBLEM
    // ------------------------------------------------------
    function loadProblem() {

        currentProblem = problems[currentIndex];
        window.currentProblem = currentProblem; // UI.js에서 접근 가능하도록 업데이트
        
        if (!currentProblem) {
            showResultPage();
            return;
        }

        document.getElementById("btn-next").classList.add("hidden");
        document.getElementById("btn-check").classList.remove("hidden");
        document.getElementById("btn-check").disabled = false; // Check 버튼 활성화

        const title = document.getElementById("problem-title");
        const idx = currentIndex + 1;

        if (currentProblem.mode === MAIN_MODE.NET_BUILD) {
            title.textContent = `전개도 완성하기 (${idx}/${problemCount})`;
        } else {
            title.textContent = `겹쳐지는 부분 찾기 (${idx}/${problemCount})`;
        }

        // UI 초기화: 반드시 init → clear 순서
        UI.init(netCanvas);
        UI.clear();

        const opt = {};
        if (currentProblem.mode === MAIN_MODE.NET_BUILD) {
            opt.removeOne = true;
            opt.highlightPositions = true;
        }

        // 전개도 렌더링
        UI.renderNet(currentProblem.net, opt);

        // 3D 초기화
        FoldEngine.init(threeCanvas);
        FoldEngine.currentNet = currentProblem.net;
        FoldEngine.loadNet(currentProblem.net);
        FoldEngine.unfoldImmediate();
        setTimeout(() => {
            FoldEngine.foldAnimate(1);  // 1초 동안 접기 (문제 로드 시 이미 접힌 상태를 보여줌)
        }, 300);

        // 겹침 모드라면 Overlap 초기화
        if (currentProblem.mode === MAIN_MODE.OVERLAP_FIND) {
            Overlap.startSelection(currentProblem.net);
            Overlap.currentMode = currentProblem.overlapMode;
        }
    }

    // ------------------------------------------------------
    // ANSWER CHECK / NEXT
    // ------------------------------------------------------
    function bindProblemButtons() {

        document.getElementById("btn-check").addEventListener("click", () => {
            
            // 중복 클릭 방지
            document.getElementById("btn-check").disabled = true;

            // 1. 3D 모델을 펼친 상태에서 접는 애니메이션 실행
            // foldEngine.js 수정으로 Promise를 반환하도록 가정
            FoldEngine.unfoldImmediate(); 
            FoldEngine.foldAnimate(1) // 1초 동안 접기
                .then(() => {
                    // 2. 애니메이션 완료 후 정답 판정
                    let correct = false;

                    if (currentProblem.mode === MAIN_MODE.NET_BUILD) {
                        correct = UI.checkPieceResult(currentProblem.net);
                    } else {
                        correct = UI.checkOverlapResult(currentProblem.net);
                    }

                    // 3. 결과 팝업 및 다음 문제 준비
                    if (correct) {
                        alert("정답입니다! 🎉");
                        document.getElementById("btn-check").classList.add("hidden");
                        document.getElementById("btn-next").classList.remove("hidden");
                    } else {
                        alert("틀렸습니다. 다시 생각해 볼까요? 🤔");
                        // 오답 시 다시 체크 가능하게
                        document.getElementById("btn-check").disabled = false; 
                        // 3D 모델 다시 펼침
                        FoldEngine.unfoldImmediate();
                        
                        // 겹침 찾기 모드의 경우, 오답 시 선택 초기화
                        if (currentProblem.mode === MAIN_MODE.OVERLAP_FIND) {
                            Overlap.startSelection(currentProblem.net);
                            UI.renderNet(currentProblem.net, {}); // 렌더링 초기화
                        }
                    }
                })
                .catch(err => {
                    console.error("Fold Animation Error:", err);
                    alert("정답 확인 중 오류가 발생했습니다.");
                    document.getElementById("btn-check").disabled = false;
                });
        });

        document.getElementById("btn-next").addEventListener("click", () => {
            currentIndex++;
            if (currentIndex >= problemCount) {
                showResultPage();
            } else {
                loadProblem();
            }
        });

        document.getElementById("btn-exit").addEventListener("click", () => {
            if (confirm("처음 화면으로 돌아갈까요?")) {
                showPage("mode-select-page");
            }
        });
    }

    // ------------------------------------------------------
    // RESULT PAGE
    // ------------------------------------------------------
    function showResultPage() {
        showPage("result-page");
        document.getElementById("result-acc").textContent =
            `${((currentIndex / problemCount) * 100).toFixed(1)}%`;

        document.getElementById("btn-restart").onclick = () => {
            showPage("mode-select-page");
        };
    }

    // ------------------------------------------------------
    // QR POPUP
    // ------------------------------------------------------
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
