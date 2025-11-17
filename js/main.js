// main.js
// ----------------------------------------------
//  새로운 index.html 구조에 맞춘 전체 메인 로직
// ----------------------------------------------

(function () {
    "use strict";

    // ===========================
    // 전역 상태
    // ===========================
    const MAIN_MODE = {
        NET_BUILD: "netBuild",       // 전개도 완성하기
        OVERLAP_FIND: "overlapFind"  // 겹쳐지는 부분 찾기
    };

    const NET_TYPE = { CUBE: "cube", RECT: "rect", BOTH: "both" };
    const OVERLAP_TYPE = { POINT: "point", EDGE: "edge", BOTH: "both" };
    const RUN_MODE = { PRACTICE: "practice", REAL: "real" };

    // 현재 설정값
    let mainMode = null;
    let netType = NET_TYPE.CUBE;
    let overlapType = OVERLAP_TYPE.POINT;
    let runMode = RUN_MODE.PRACTICE;
    let problemCount = 10;

    // 문제 리스트 & 진행 상태
    let problems = [];
    let currentIndex = 0;
    let currentProblem = null;

    // Canvas
    let netCanvas, netCtx, threeCanvas;

    // ===========================
    // 초기 바인딩
    // ===========================
    document.addEventListener("DOMContentLoaded", init);

    function init() {

        netCanvas = document.getElementById("net-canvas");
        netCtx = netCanvas.getContext("2d");
        threeCanvas = document.getElementById("three-view");

        bindModeSelectPage();
        bindNetSetupPage();
        bindOverlapSetupPage();
        bindProblemButtons();
        bindQRPopup();

        showPage("mode-select-page");
    }

    // ===========================
    // 페이지 전환
    // ===========================
    function showPage(pageId) {
        const pages = [
            "mode-select-page",
            "setup-net",
            "setup-overlap",
            "problem-page",
            "result-page"
        ];

        pages.forEach(id => {
            document.getElementById(id).classList.add("hidden");
        });

        document.getElementById(pageId).classList.remove("hidden");
    }

    // ===========================
    // 1. 모드 선택 페이지
    // ===========================
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

    // ===========================
    // 2-A. 전개도 완성하기 설정
    // ===========================
    function bindNetSetupPage() {

        // 입체 종류 선택
        document.querySelectorAll("#net-type-group button").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll("#net-type-group button")
                    .forEach(b => b.classList.remove("selected"));

                btn.classList.add("selected");
                netType = btn.dataset.type;
            });
        });

        // 진행 방식
        document.querySelectorAll("#net-run-group button").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll("#net-run-group button")
                    .forEach(b => b.classList.remove("selected"));

                btn.classList.add("selected");
                runMode = btn.dataset.run;
            });
        });

        // 문제 개수
        const display = document.getElementById("net-q-display");
        document.getElementById("net-q-minus").addEventListener("click", () => {
            problemCount = Math.max(1, problemCount - 1);
            display.textContent = problemCount;
        });
        document.getElementById("net-q-plus").addEventListener("click", () => {
            problemCount = Math.min(50, problemCount + 1);
            display.textContent = problemCount;
        });

        // 시작
        document.getElementById("start-net").addEventListener("click", startNetProblems);
    }

    // ===========================
    // 2-B. 겹쳐지는 부분 찾기 설정
    // ===========================
    function bindOverlapSetupPage() {

        // 유형
        document.querySelectorAll("#ov-type-group button").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll("#ov-type-group button")
                    .forEach(b => b.classList.remove("selected"));

                btn.classList.add("selected");
                overlapType = btn.dataset.type;
            });
        });

        // 진행 방식
        document.querySelectorAll("#ov-run-group button").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll("#ov-run-group button")
                    .forEach(b => b.classList.remove("selected"));

                btn.classList.add("selected");
                runMode = btn.dataset.run;
            });
        });

        // 문제 수
        const display = document.getElementById("ov-q-display");
        document.getElementById("ov-q-minus").addEventListener("click", () => {
            problemCount = Math.max(1, problemCount - 1);
            display.textContent = problemCount;
        });
        document.getElementById("ov-q-plus").addEventListener("click", () => {
            problemCount = Math.min(50, problemCount + 1);
            display.textContent = problemCount;
        });

        // 시작
        document.getElementById("start-overlap").addEventListener("click", startOverlapProblems);
    }

    // ===========================
    // 문제 생성
    // ===========================
    function startNetProblems() {
        problems = [];

        for (let i = 0; i < problemCount; i++) {
            // 정육면체 우선
            const p = CubeNets.getRandomPieceProblem();  
            problems.push({ mode: MAIN_MODE.NET_BUILD, data: p });
        }

        currentIndex = 0;
        showPage("problem-page");
        loadProblem();
    }

    function startOverlapProblems() {
        problems = [];

        for (let i = 0; i < problemCount; i++) {
            const p = CubeNets.getRandomOverlapProblem();
            problems.push({ mode: MAIN_MODE.OVERLAP_FIND, data: p });
        }

        currentIndex = 0;
        showPage("problem-page");
        loadProblem();
    }

    // ===========================
    // 문제 불러오기
    // ===========================
    function loadProblem() {
        currentProblem = problems[currentIndex];

        if (!currentProblem) {
            showResultPage();
            return;
        }

        document.getElementById("btn-next").classList.add("hidden");
        document.getElementById("btn-check").classList.remove("hidden");

        // 문제 제목
        if (currentProblem.mode === MAIN_MODE.NET_BUILD) {
            document.getElementById("problem-title").textContent =
                `전개도 완성하기 (${currentIndex + 1}/${problemCount})`;
        } else {
            document.getElementById("problem-title").textContent =
                `겹쳐지는 부분 찾기 (${currentIndex + 1}/${problemCount})`;
        }

        // 2D 전개도 초기화
        UI.clear();
        UI.init(netCanvas);
        UI.renderNet(currentProblem.data.net, { removeOne: true, highlightPositions: true });

        // 3D 초기화
        FoldEngine.init(threeCanvas);
        FoldEngine.loadNet(currentProblem.data.net);
        FoldEngine.unfoldImmediate();
    }

    // ===========================
    // 문제 버튼
    // ===========================
    function bindProblemButtons() {
        // 정답 확인
        document.getElementById("btn-check").addEventListener("click", () => {
            let correct = false;

            if (currentProblem.mode === MAIN_MODE.NET_BUILD) {
                correct = UI.checkPieceResult(currentProblem.data.net);
            } else {
                correct = UI.checkOverlapResult(currentProblem.data.net);
            }

            if (correct) {
                alert("정답입니다! 🎉");
                document.getElementById("btn-check").classList.add("hidden");
                document.getElementById("btn-next").classList.remove("hidden");
            } else {
                alert("틀렸습니다. 다시 시도해보세요!");
            }
        });

        // 다음 문제
        document.getElementById("btn-next").addEventListener("click", () => {
            currentIndex++;
            if (currentIndex >= problems.length) {
                showResultPage();
            } else {
                loadProblem();
            }
        });

        // 종료
        document.getElementById("btn-exit").addEventListener("click", () => {
            if (confirm("학습을 종료하고 처음으로 돌아갈까요?")) {
                showPage("mode-select-page");
            }
        });
    }

    // ===========================
    // 결과 페이지
    // ===========================
    function showResultPage() {
        showPage("result-page");
        document.getElementById("result-acc").textContent =
            `${((currentIndex / problemCount) * 100).toFixed(1)}%`;
    }

    // ===========================
    // QR POPUP
    // ===========================
    function bindQRPopup() {
        document.getElementById("qr-btn").addEventListener("click", () => {
            document.getElementById("qr-popup").style.display = "flex";
            const holder = document.getElementById("qr-holder");
            holder.innerHTML = "";

            new QRCode(holder, {
                text: "https://cube.3arch2nd.site",
                width: 180,
                height: 180,
            });
        });

        document.getElementById("qr-close").addEventListener("click", () => {
            document.getElementById("qr-popup").style.display = "none";
        });
    }

})();
