// main.js – Cube + Rectangular Prism 완전 통합 버전
// ------------------------------------------------------

(function () {
    "use strict";

    // -------------------------
    // 모드 정의
    // -------------------------
    const MAIN_MODE = {
        NET_BUILD: "netBuild",
        OVERLAP_FIND: "overlapFind"
    };

    const NET_TYPE = { CUBE: "cube", RECT: "rect", BOTH: "both" };
    const OVERLAP_TYPE = { POINT: "point", EDGE: "edge", BOTH: "both" };
    const RUN_MODE = { PRACTICE: "practice", REAL: "real" };

    // -------------------------
    // 설정값
    // -------------------------
    let mainMode = null;
    let netType = NET_TYPE.CUBE;
    let overlapType = OVERLAP_TYPE.POINT;
    let runMode = RUN_MODE.PRACTICE;
    let problemCount = 10;

    // -------------------------
    // 문제 리스트 & 상태
    // -------------------------
    let problems = [];
    let currentIndex = 0;
    let currentProblem = null;

    // canvas
    let netCanvas, netCtx, threeCanvas;

    // -------------------------
    // 초기 bind
    // -------------------------
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

    // ----------------------------------------------------
    // 페이지 전환
    // ----------------------------------------------------
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

    // ----------------------------------------------------
    // 모드 선택
    // ----------------------------------------------------
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

    // ----------------------------------------------------
    // 전개도 완성하기 설정
    // ----------------------------------------------------
    function bindNetSetupPage() {
        // 입체 종류
        document.querySelectorAll("#net-type-group button").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll("#net-type-group button")
                    .forEach(b => b.classList.remove("selected"));
                btn.classList.add("selected");
                netType = btn.dataset.type;
            });
        });

        // 연습/실전
        document.querySelectorAll("#net-run-group button").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll("#net-run-group button")
                    .forEach(b => b.classList.remove("selected"));
                btn.classList.add("selected");
                runMode = btn.dataset.run;
            });
        });

        // 문제 수
        const disp = document.getElementById("net-q-display");
        document.getElementById("net-q-minus").addEventListener("click", () => {
            problemCount = Math.max(1, problemCount - 1);
            disp.textContent = problemCount;
        });
        document.getElementById("net-q-plus").addEventListener("click", () => {
            problemCount = Math.min(50, problemCount + 1);
            disp.textContent = problemCount;
        });

        // 시작
        document.getElementById("start-net").addEventListener("click", startNetProblems);
    }

    // ----------------------------------------------------
    // 겹침 문제 설정
    // ----------------------------------------------------
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

    // ----------------------------------------------------
    // 문제 생성기
    // ----------------------------------------------------
    function generateOneNetProblem() {
        // 정육면체
        if (netType === NET_TYPE.CUBE) {
            const p = CubeNets.getRandomPieceProblem();
            return {
                mode: MAIN_MODE.NET_BUILD,
                type: "cube",
                net: p.net,
                dims: null
            };
        }

        // 직육면체
        if (netType === NET_TYPE.RECT) {
            const r = RectPrismNets.getRandomRectNet();
            return {
                mode: MAIN_MODE.NET_BUILD,
                type: "rect",
                net: r.net,
                dims: r.dims
            };
        }

        // 둘 다 → 랜덤
        if (netType === NET_TYPE.BOTH) {
            const isRect = Math.random() < 0.5;
            if (isRect) {
                const r = RectPrismNets.getRandomRectNet();
                return {
                    mode: MAIN_MODE.NET_BUILD,
                    type: "rect",
                    net: r.net,
                    dims: r.dims
                };
            } else {
                const p = CubeNets.getRandomPieceProblem();
                return {
                    mode: MAIN_MODE.NET_BUILD,
                    type: "cube",
                    net: p.net,
                    dims: null
                };
            }
        }
    }

    // ----------------------------------------------------
    // 전개도 문제 시작
    // ----------------------------------------------------
    function startNetProblems() {
        problems = [];
        for (let i = 0; i < problemCount; i++) {
            problems.push(generateOneNetProblem());
        }

        currentIndex = 0;
        showPage("problem-page");
        loadProblem();
    }

    // ----------------------------------------------------
    // 겹침 문제 (지금은 정육면체 전용)
    // ----------------------------------------------------
    function startOverlapProblems() {
        problems = [];
        for (let i = 0; i < problemCount; i++) {
            const p = CubeNets.getRandomOverlapProblem();
            problems.push({
                mode: MAIN_MODE.OVERLAP_FIND,
                type: "cube",
                net: p.net,
                dims: null
            });
        }

        currentIndex = 0;
        showPage("problem-page");
        loadProblem();
    }

    // ----------------------------------------------------
    // 문제 로드
    // ----------------------------------------------------
    function loadProblem() {
        currentProblem = problems[currentIndex];
        if (!currentProblem) {
            showResultPage();
            return;
        }

        document.getElementById("btn-next").classList.add("hidden");
        document.getElementById("btn-check").classList.remove("hidden");

        // 제목
        const title = document.getElementById("problem-title");
        title.textContent =
            currentProblem.mode === MAIN_MODE.NET_BUILD
                ? `전개도 완성하기 (${currentIndex + 1}/${problemCount})`
                : `겹쳐지는 부분 찾기 (${currentIndex + 1}/${problemCount})`;

        // Net UI
        UI.clear();
        UI.init(netCanvas);

        // 2D 전개도 렌더링
        const opt = {};
        if (currentProblem.mode === MAIN_MODE.NET_BUILD) {
            opt.removeOne = true;
            opt.highlightPositions = true;
        }
        UI.renderNet(currentProblem.net, opt);

        // 3D
        FoldEngine.init(threeCanvas);
        FoldEngine.currentNet = currentProblem.net; // validator & overlap에서 사용
        FoldEngine.loadNet(currentProblem.net);
        FoldEngine.unfoldImmediate();
    }

    // ----------------------------------------------------
    // 버튼: 정답 확인 / 다음 / 종료
    // ----------------------------------------------------
    function bindProblemButtons() {
        // 정답 확인
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
                alert("틀렸습니다. 다시 해보세요!");
            }
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

    // ----------------------------------------------------
    // 결과 페이지
    // ----------------------------------------------------
    function showResultPage() {
        showPage("result-page");
        document.getElementById("result-acc").textContent =
            `${((currentIndex / problemCount) * 100).toFixed(1)}%`;
    }

    // ----------------------------------------------------
    // QR
    // ----------------------------------------------------
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
