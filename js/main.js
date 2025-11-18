/**
 * main.js – 화면/버튼/문제 진행 전체 통합
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

        document.querySelector("#net-run-group button[data-run='practice']").classList.add("selected");
        document.querySelector("#ov-type-group button[data-type='both']").classList.add("selected");
        document.querySelector("#ov-run-group button[data-run='practice']").classList.add("selected");

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
            const pageElement = document.getElementById(id);
            if (pageElement) pageElement.classList.add("hidden");
        });

        const targetPage = document.getElementById(pageId);
        if (targetPage) targetPage.classList.remove("hidden");
    }

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

    function generateOneNetProblem() {
        const p = CubeNets.getRandomPieceProblem();
        return {
            mode: MAIN_MODE.NET_BUILD,
            solid: "cube",
            net: p.net,
            dims: null
        };
    }

    function generateOneOverlapProblem() {
        const netObj = CubeNets.getRandomOverlapProblem(overlapMode);

        return {
            mode: MAIN_MODE.OVERLAP_FIND,
            solid: "cube",
            net: netObj.net,
            dims: null,
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

    async function loadProblem() {
        currentProblem = problems[currentIndex];
        window.CubeProject.currentProblem = currentProblem;

        if (!currentProblem) {
            showResultPage();
            return;
        }

        document.getElementById("btn-next").classList.add("hidden");
        document.getElementById("btn-check").classList.remove("hidden");
        document.getElementById("btn-check").disabled = false;

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
            opt.removeOne = true;
            opt.highlightPositions = true;
        }

        UI.renderNet(currentProblem.net, opt);

        FoldEngine.init(threeCanvas);

        const netFor3D = JSON.parse(JSON.stringify(currentProblem.net));

        if (currentProblem.mode === MAIN_MODE.NET_BUILD) {
            const removedId = window.UI.getRemovedFaceId();
            const removedFaceIndex = netFor3D.faces.findIndex(f => f.id === removedId);
            if (removedFaceIndex !== -1) {
                netFor3D.faces.splice(removedFaceIndex, 1);
            }
        }

        await FoldEngine.loadNet(netFor3D);
        FoldEngine.unfoldImmediate();

        if (currentProblem.mode === MAIN_MODE.OVERLAP_FIND) {
            Overlap.startSelection(currentProblem.net);
        }
    }

    function bindProblemButtons() {
        document.getElementById("btn-check").addEventListener("click", async () => {
            document.getElementById("btn-check").disabled = true;

            let correct = false;
            let netForFold = currentProblem.net;

            if (currentProblem.mode === MAIN_MODE.NET_BUILD) {
                const placedPos = window.UI.placed;

                if (placedPos) {
                    netForFold = JSON.parse(JSON.stringify(currentProblem.net));
                    const removedId = window.UI.getRemovedFaceId();

                    let f = netForFold.faces.find(f => f.id === removedId);
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
                } else {
                    document.getElementById("btn-check").disabled = false;
                    alert("조각이 배치되지 않았습니다.");
                    return;
                }

                await FoldEngine.loadNet(netForFold);

                correct = Validator.validateNet(netForFold);

            } else {
                await FoldEngine.loadNet(netForFold);
                correct = window.Overlap.checkUserAnswer(netForFold);
            }

            FoldEngine.unfoldImmediate();

            FoldEngine.foldAnimate(1.5)
                .then(() => FoldEngine.showSolvedView(1.5))
                .then(() => {
                    if (correct) {
                        alert("정답입니다! 🎉");
                        document.getElementById("btn-check").classList.add("hidden");
                        document.getElementById("btn-next").classList.remove("hidden");
                    } else {
                        // 오답 메시지 단순화
                        alert("다시 생각해 볼까요?");

                        document.getElementById("btn-check").disabled = false;

                        setTimeout(() => {
                            FoldEngine.unfoldImmediate();

                            if (currentProblem.mode === MAIN_MODE.OVERLAP_FIND) {
                                Overlap.startSelection(currentProblem.net);
                                UI.renderNet(currentProblem.net, {});
                            } else {
                                // 같은 문제 그대로, 조각 위치에 빗금 표시
                                UI.isWrong = true;
                                UI.renderNet(currentProblem.net, {
                                    removeOne: true,
                                    highlightPositions: true,
                                    markWrong: true
                                });
                            }
                        }, 400);
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

    function showResultPage() {
        const correctCount = currentIndex; // 간단히: 푼 문제 수 = 맞춘 문제 수 가정(실전 모드 확장 가능)

        showPage("result-page");
        document.getElementById("result-acc").textContent =
            `${((correctCount / problemCount) * 100).toFixed(1)}%`;

        document.getElementById("btn-restart").onclick = () => {
            showPage("mode-select-page");
        };
    }

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
