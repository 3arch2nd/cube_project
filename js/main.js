/**
 * main.js – 정육면체 전개도/겹침 통합
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

    document.addEventListener("DOMContentLoaded", init);

    function init() {
        netCanvas = document.getElementById("net-canvas");
        threeCanvas = document.getElementById("three-view");

        bindModeSelectPage();
        bindNetSetupPage();
        bindOverlapSetupPage();
        bindProblemButtons();
        bindQRPopup();

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
    }

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
    }

    // ------------------------------------------------
    // 모드 선택
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

    // ------------------------------------------------
    // 겹침 찾기 설정
    // ------------------------------------------------
    function bindOverlapSetupPage() {
        document.querySelectorAll("#ov-type-group button").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll("#ov-type-group button")
                    .forEach(b => b.classList.remove("selected"));
                btn.classList.add("selected");
                overlapMode = btn.dataset.type;
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

    // ------------------------------------------------
    // 문제 생성
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
    // 문제 로드
    // ------------------------------------------------
    async function loadProblem() {
        currentProblem = problems[currentIndex];
        window.CubeProject.currentProblem = currentProblem;

        if (!currentProblem) {
            showResultPage();
            return;
        }

        document.getElementById("btn-next").classList.add("hidden");
        const btnCheck = document.getElementById("btn-check");
        btnCheck.classList.remove("hidden");
        btnCheck.disabled = false;

        const title = document.getElementById("problem-title");
        const idx = currentIndex + 1;

        if (currentProblem.mode === MAIN_MODE.NET_BUILD) {
            title.textContent = `전개도 완성하기 (${idx}/${problemCount})`;
        } else {
            title.textContent = `겹쳐지는 부분 찾기 (${idx}/${problemCount})`;
        }

        UI.init(netCanvas);
        UI.clear();

        const opt = {};
        if (currentProblem.mode === MAIN_MODE.NET_BUILD) {
            opt.highlightPositions = true;
        }
        UI.renderNet(currentProblem.net, opt);

        FoldEngine.init(threeCanvas);

        const netFor3D = JSON.parse(JSON.stringify(currentProblem.net));

        if (currentProblem.mode === MAIN_MODE.NET_BUILD) {
            const removedId = window.UI.getRemovedFaceId();
            const idxFace = netFor3D.faces.findIndex(f => f.id === removedId);
            if (idxFace !== -1) {
                netFor3D.faces.splice(idxFace, 1);
            }
        }

        await FoldEngine.loadNet(netFor3D);
        FoldEngine.unfoldImmediate();

        if (currentProblem.mode === MAIN_MODE.OVERLAP_FIND) {
            Overlap.startSelection(currentProblem.net);
        }
    }

    // ------------------------------------------------
    // 버튼 바인딩 (정답 확인/다음/종료)
    // ------------------------------------------------
    function bindProblemButtons() {
        document.getElementById("btn-check").addEventListener("click", async () => {
            const btnCheck = document.getElementById("btn-check");
            btnCheck.disabled = true;

            let correct = false;
            let netForFold = currentProblem.net;

            if (currentProblem.mode === MAIN_MODE.NET_BUILD) {
                const placedPos = window.UI.placed;

                if (!placedPos) {
                    alert("조각이 배치되지 않았습니다.");
                    btnCheck.disabled = false;
                    return;
                }

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
                        h: placedPos.h
                    });
                    netForFold.faces.sort((a, b) => a.id - b.id);
                }

                await FoldEngine.loadNet(netForFold);
                correct = Validator.validateNet(netForFold);
            } else {
                await FoldEngine.loadNet(netForFold);
                correct = window.Overlap.checkUserAnswer(netForFold);
            }

            FoldEngine.unfoldImmediate();

            FoldEngine
                .foldAnimate(1.5)
                .then(() => FoldEngine.showSolvedView(1.5))
                .then(() => {
                    if (correct) {
                        alert("정답입니다! 🎉");
                        btnCheck.classList.add("hidden");
                        document.getElementById("btn-next").classList.remove("hidden");
                    } else {
                        // 요청: 메시지 단순하게
                        alert("다시 생각해 볼까요? 🤔");

                        btnCheck.disabled = false;

                        setTimeout(() => {
                            FoldEngine.unfoldImmediate();

                            if (currentProblem.mode === MAIN_MODE.OVERLAP_FIND) {
                                Overlap.startSelection(currentProblem.net);
                                UI.renderNet(currentProblem.net, {});
                            } else {
                                // 같은 문제 계속 보여주기
                                UI.renderNet(currentProblem.net, { highlightPositions: true });
                            }
                        }, 1500);
                    }
                })
                .catch(err => {
                    console.error("Fold Animation Error:", err);
                    alert("정답 확인 중 오류가 발생했습니다.");
                    btnCheck.disabled = false;
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

    // ------------------------------------------------
    // 결과 페이지
    // ------------------------------------------------
    function showResultPage() {
        const correctCount = currentIndex; // 간단히 현재 index를 정답 개수로 사용

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
