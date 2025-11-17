/**
 * main.js – Cube + Rectangular Prism + Overlap + NetBuild 통합 관리
 */

(function () {
    "use strict";

    // ------------------------------------------------------
    // ENUMS
    // ------------------------------------------------------
    const MAIN_MODE = {
        NET_BUILD: "netBuild",
        OVERLAP_FIND: "overlapFind"
    };

    const NET_TYPE = { CUBE:"cube", RECT:"rect", BOTH:"both" };
    const OVERLAP_TYPE = { CUBE:"cube", RECT:"rect", BOTH:"both" };
    const RUN_MODE = { PRACTICE:"practice", REAL:"real" };

    // ------------------------------------------------------
    // 상태 변수
    // ------------------------------------------------------
    let mainMode = null;
    let netType = NET_TYPE.CUBE;
    let overlapType = OVERLAP_TYPE.CUBE;
    let runMode = RUN_MODE.PRACTICE;
    let problemCount = 10;

    let problems = [];
    let currentIndex = 0;
    let currentProblem = null;

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
    // OVERLAP SETUP PAGE
    // ------------------------------------------------------
    function bindOverlapSetupPage() {

        document.querySelectorAll("#ov-type-group button").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll("#ov-type-group button")
                    .forEach(b => b.classList.remove("selected"));
                btn.classList.add("selected");
                overlapType = btn.dataset.type;
            });
        });

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

    // --- 전개도 문제 1개 생성 ---
    function generateOneNetProblem() {

        if (netType === NET_TYPE.CUBE) {
            const p = CubeNets.getRandomPieceProblem();
            return {
                mode: MAIN_MODE.NET_BUILD,
                type: "cube",
                net: p.net,
                dims: null
            };
        }

        if (netType === NET_TYPE.RECT) {
            const r = RectPrismNets.getRandomRectNet();
            return {
                mode: MAIN_MODE.NET_BUILD,
                type: "rect",
                net: r.net,
                dims: r.dims
            };
        }

        // BOTH
        if (Math.random() < 0.5) {
            const p = CubeNets.getRandomPieceProblem();
            return { mode: MAIN_MODE.NET_BUILD, type:"cube", net:p.net, dims:null };
        } else {
            const r = RectPrismNets.getRandomRectNet();
            return { mode: MAIN_MODE.NET_BUILD, type:"rect", net:r.net, dims:r.dims };
        }
    }

    // --- 겹침 문제 생성 ---
    function generateOneOverlapProblem() {
        if (overlapType === OVERLAP_TYPE.CUBE) {
            const p = CubeNets.getRandomOverlapProblem();
            return { mode:MAIN_MODE.OVERLAP_FIND, type:"cube", net:p.net, dims:null };
        }
        if (overlapType === OVERLAP_TYPE.RECT) {
            const r = RectPrismNets.getRandomRectOverlapProblem();
            return { mode:MAIN_MODE.OVERLAP_FIND, type:"rect", net:r.net, dims:r.dims };
        }

        // BOTH
        if (Math.random() < 0.5) {
            const p = CubeNets.getRandomOverlapProblem();
            return { mode:"overlapFind", type:"cube", net:p.net, dims:null };
        } else {
            const r = RectPrismNets.getRandomRectOverlapProblem();
            return { mode:"overlapFind", type:"rect", net:r.net, dims:r.dims };
        }
    }

    // ------------------------------------------------------
    // START PROBLEMS
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
    // LOAD PROBLEM
    // ------------------------------------------------------
    function loadProblem() {
        currentProblem = problems[currentIndex];
        if (!currentProblem) {
            showResultPage();
            return;
        }

        document.getElementById("btn-next").classList.add("hidden");
        document.getElementById("btn-check").classList.remove("hidden");

        const title = document.getElementById("problem-title");
        title.textContent =
            currentProblem.mode === MAIN_MODE.NET_BUILD
                ? `전개도 완성하기 (${currentIndex+1}/${problemCount})`
                : `겹쳐지는 부분 찾기 (${currentIndex+1}/${problemCount})`;

        // UI 초기화
        UI.clear();
        UI.init(netCanvas);

        // 전개도 렌더
        const opt = {};
        if (currentProblem.mode === MAIN_MODE.NET_BUILD) {
            opt.removeOne = true;
            opt.highlightPositions = true;
        }

        UI.renderNet(currentProblem.net, opt);

        // 3D 초기화
        FoldEngine.init(threeCanvas);
        FoldEngine.currentNet = currentProblem.net;
        FoldEngine.loadNet(currentProblem.net);
        FoldEngine.unfoldImmediate();
    }

    // ------------------------------------------------------
    // ANSWER CHECK / NEXT / EXIT
    // ------------------------------------------------------
    function bindProblemButtons() {

        document.getElementById("btn-check").addEventListener("click", () => {
            let correct = false;

            if (currentProblem.mode === MAIN_MODE.NET_BUILD) {
                correct = UI.checkPieceResult(currentProblem.net);
            } else {
                correct = UI.checkOverlapResult(currentProblem.net);
            }

            if (correct) {
                alert("정답입니다!");
                document.getElementById("btn-check").classList.add("hidden");
                document.getElementById("btn-next").classList.remove("hidden");
            } else {
                alert("틀렸습니다. 다시 시도해보세요!");
            }
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
            `${((currentIndex/problemCount)*100).toFixed(1)}%`;
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
