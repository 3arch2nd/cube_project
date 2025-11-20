/**
 * main.js – 정육면체 전개도/겹침 통합 최신 버전 (Babylon.js + 슬라이더 대응)
 */

(function () {
    "use strict";

    // ✅ 기존 것이 있어도 덮어쓰지 않고 재사용
    const CubeProjectNS = window.CubeProject || {};
    window.CubeProject = CubeProjectNS;

    const MAIN_MODE = {
        NET_BUILD: "netBuild",
        OVERLAP_FIND: "overlapFind"
    };
    CubeProjectNS.MAIN_MODE = MAIN_MODE;

    const OVERLAP_MODE = { POINT: "point", EDGE: "edge", BOTH: "both" };
    CubeProjectNS.OVERLAP_MODE = OVERLAP_MODE;

    const RUN_MODE = { PRACTICE: "practice", REAL: "real" };
    CubeProjectNS.RUN_MODE = RUN_MODE;

    let mainMode = null;
    let overlapMode = OVERLAP_MODE.BOTH;

    let runMode = RUN_MODE.PRACTICE;
    let problemCount = 10;

    let problems = [];
    let currentIndex = 0;
    let currentProblem = null;
    CubeProjectNS.currentProblem = null;  // 항상 최신 문제를 여기에 넣음

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

                window.scene = scene;
                window.engine = engine;

                FoldEngine.init(threeCanvas, engine, scene);

                startRenderLoop();

                window.addEventListener("resize", () => {
                    if (engine) engine.resize();
                    if (FoldEngine.onResize) FoldEngine.onResize();
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
        bindFoldSlider();

        // 기본 선택 상태
        const btnNetPractice = document.querySelector("#net-run-group button[data-run='practice']");
        const btnOvBoth = document.querySelector("#ov-type-group button[data-type='both']");
        const btnOvPractice = document.querySelector("#ov-run-group button[data-run='practice']");
        if (btnNetPractice) btnNetPractice.classList.add("selected");
        if (btnOvBoth) btnOvBoth.classList.add("selected");
        if (btnOvPractice) btnOvPractice.classList.add("selected");

        showPage("mode-select-page");

        const foldControl = document.getElementById("fold-control");
        if (foldControl) foldControl.classList.add("hidden");
    }

    // ------------------------------------------------
    // 렌더링 루프
    // ------------------------------------------------
    function startRenderLoop() {
        if (!engine || !scene) return;
        engine.runRenderLoop(function () {
            if (scene) scene.render();
        });
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

        const foldControl = document.getElementById("fold-control");
        if (foldControl) {
            if (pageId === "problem-page") {
                foldControl.classList.remove("hidden");
            } else {
                foldControl.classList.add("hidden");
            }
        }
    }

    // ------------------------------------------------
    // 모드 선택 화면
    // ------------------------------------------------
    function bindModeSelectPage() {
        const btnNet = document.getElementById("btn-mode-net");
        const btnOverlap = document.getElementById("btn-mode-overlap");

        if (btnNet) {
            btnNet.onclick = () => {
                mainMode = MAIN_MODE.NET_BUILD;
                showPage("setup-net");
            };
        }

        if (btnOverlap) {
            btnOverlap.onclick = () => {
                mainMode = MAIN_MODE.OVERLAP_FIND;
                showPage("setup-overlap");
            };
        }
    }

    // ------------------------------------------------
    // 전개도 완성하기 설정
    // ------------------------------------------------
    function bindNetSetupPage() {
        const runButtons = document.querySelectorAll("#net-run-group button");
        runButtons.forEach(btn => {
            btn.addEventListener("click", () => {
                runButtons.forEach(b => b.classList.remove("selected"));
                btn.classList.add("selected");
                runMode = btn.dataset.run;
            });
        });

        const disp = document.getElementById("net-q-display");
        const minus = document.getElementById("net-q-minus");
        const plus = document.getElementById("net-q-plus");

        if (minus && plus && disp) {
            minus.addEventListener("click", () => {
                problemCount = Math.max(1, problemCount - 1);
                disp.textContent = problemCount;
            });
            plus.addEventListener("click", () => {
                problemCount = Math.min(50, problemCount + 1);
                disp.textContent = problemCount;
            });
        }

        const startBtn = document.getElementById("start-net");
        if (startBtn) {
            startBtn.addEventListener("click", startNetProblems);
        }
    }

    // ------------------------------------------------
    // 겹침 찾기 설정
    // ------------------------------------------------
    function bindOverlapSetupPage() {
        const typeButtons = document.querySelectorAll("#ov-type-group button");
        typeButtons.forEach(btn => {
            btn.addEventListener("click", () => {
                typeButtons.forEach(b => b.classList.remove("selected"));
                btn.classList.add("selected");
                overlapMode = btn.dataset.type;
            });
        });

        const runButtons = document.querySelectorAll("#ov-run-group button");
        runButtons.forEach(btn => {
            btn.addEventListener("click", () => {
                runButtons.forEach(b => b.classList.remove("selected"));
                btn.classList.add("selected");
                runMode = btn.dataset.run;
            });
        });

        const disp = document.getElementById("ov-q-display");
        const minus = document.getElementById("ov-q-minus");
        const plus = document.getElementById("ov-q-plus");

        if (minus && plus && disp) {
            minus.addEventListener("click", () => {
                problemCount = Math.max(1, problemCount - 1);
                disp.textContent = problemCount;
            });
            plus.addEventListener("click", () => {
                problemCount = Math.min(50, problemCount + 1);
                disp.textContent = problemCount;
            });
        }

        const startBtn = document.getElementById("start-overlap");
        if (startBtn) {
            startBtn.addEventListener("click", startOverlapProblems);
        }
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
        CubeProjectNS.currentProblem = currentProblem;

        if (!currentProblem) {
            showResultPage();
            return;
        }

        const btnNext = document.getElementById("btn-next");
        const btnCheck = document.getElementById("btn-check");
        if (btnNext && btnCheck) {
            btnNext.classList.add("hidden");
            btnCheck.classList.remove("hidden");
            btnCheck.disabled = false;
        }

        const foldSlider = document.getElementById('fold-slider');
        const sliderValue = document.getElementById('slider-value');
        if (foldSlider && sliderValue) {
            foldSlider.value = 0;
            sliderValue.textContent = '0.00';
            foldSlider.disabled = false;
        }

        const title = document.getElementById("problem-title");
        const idx = currentIndex + 1;

        if (title) {
            if (currentProblem.mode === MAIN_MODE.NET_BUILD) {
                title.textContent = `전개도 완성하기 (${idx}/${problemCount})`;
            } else {
                title.textContent = `겹쳐지는 부분 찾기 (${idx}/${problemCount})`;
            }
        }

        // 2D 전개도
        UI.init(netCanvas);
        UI.clear();

        const opt = {};
        if (currentProblem.mode === MAIN_MODE.NET_BUILD) {
            opt.highlightPositions = true;
        }
        UI.renderNet(currentProblem.net, opt);

        // 3D용 데이터
        const netFor3D = JSON.parse(JSON.stringify(currentProblem.net));

        if (currentProblem.mode === MAIN_MODE.NET_BUILD && window.UI && UI.getRemovedFaceId) {
            const removedId = UI.getRemovedFaceId();
            netFor3D.faces.forEach(f => {
                if (f.id === removedId) {
                    f._hidden = true;
                }
            });
        }

        await FoldEngine.loadNet(netFor3D);
        FoldEngine.unfoldImmediate();

        if (currentProblem.mode === MAIN_MODE.OVERLAP_FIND && window.Overlap) {
            Overlap.startSelection(currentProblem.net);
        }
    }

    // ------------------------------------------------
    // 슬라이더 제어
    // ------------------------------------------------
    function bindFoldSlider() {
        const foldSlider = document.getElementById('fold-slider');
        const sliderValueSpan = document.getElementById('slider-value');

        if (!foldSlider || !sliderValueSpan) return;

        foldSlider.addEventListener('input', () => {
            const progress = parseFloat(foldSlider.value);
            sliderValueSpan.textContent = progress.toFixed(2);

            if (typeof FoldEngine.setFoldProgress === 'function') {
                FoldEngine.setFoldProgress(progress);
            }
        });
    }

    // ------------------------------------------------
    // 정답 확인 / 다음 / 종료 버튼
    // ------------------------------------------------
    function bindProblemButtons() {
        const btnCheck = document.getElementById("btn-check");
        const btnNext = document.getElementById("btn-next");
        const btnExit = document.getElementById("btn-exit");

        if (btnCheck) {
            btnCheck.addEventListener("click", async () => {
                btnCheck.disabled = true;
                const foldSlider = document.getElementById('fold-slider');
                if (foldSlider) foldSlider.disabled = true;

                let correct = false;
                let netForFold = currentProblem.net;

                if (currentProblem.mode === MAIN_MODE.NET_BUILD) {
                    const placedPos = window.UI.placed;
                    if (!placedPos) {
                        alert("조각이 배치되지 않았습니다.");
                        btnCheck.disabled = false;
                        if (foldSlider) foldSlider.disabled = false;
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

                // 여기서는 FoldEngine이 "완전히 접힌 상태"로 간다고 가정하는 스텁
                if (typeof FoldEngine.foldImmediate === 'function') {
                    FoldEngine.foldImmediate(1.0);
                }
                if (foldSlider) {
                    foldSlider.value = 1.0;
                    const sliderValueSpan = document.getElementById('slider-value');
                    if (sliderValueSpan) sliderValueSpan.textContent = '1.00';
                }

                setTimeout(() => {
                    if (correct) {
                        alert("정답입니다! 🎉 3D 큐브를 돌려보세요!");
                        if (btnCheck && btnNext) {
                            btnCheck.classList.add("hidden");
                            btnNext.classList.remove("hidden");
                        }
                        if (foldSlider) foldSlider.disabled = false;
                    } else {
                        alert("다시 생각해 볼까요? 🤔 큐브를 펼쳐보며 확인해 보세요.");

                        if (foldSlider) foldSlider.disabled = false;
                        btnCheck.disabled = false;

                        setTimeout(() => {
                            if (typeof FoldEngine.unfoldImmediate === 'function') {
                                FoldEngine.unfoldImmediate();
                            }
                            if (foldSlider) {
                                foldSlider.value = 0.0;
                                const sliderValueSpan = document.getElementById('slider-value');
                                if (sliderValueSpan) sliderValueSpan.textContent = '0.00';
                            }

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
        }

        if (btnNext) {
            btnNext.addEventListener("click", () => {
                currentIndex++;
                if (currentIndex >= problemCount) {
                    showResultPage();
                } else {
                    loadProblem();
                }
            });
        }

        if (btnExit) {
            btnExit.addEventListener("click", () => {
                if (confirm("처음 화면으로 돌아갈까요?")) {
                    showPage("mode-select-page");
                }
            });
        }
    }

    // ------------------------------------------------
    // 결과 페이지
    // ------------------------------------------------
    function showResultPage() {
        const correctCount = currentIndex;

        showPage("result-page");
        const accSpan = document.getElementById("result-acc");
        if (accSpan) {
            accSpan.textContent = `${((correctCount / problemCount) * 100).toFixed(1)}%`;
        }

        const btnRestart = document.getElementById("btn-restart");
        if (btnRestart) {
            btnRestart.onclick = () => {
                showPage("mode-select-page");
            };
        }
    }

    // ------------------------------------------------
    // QR 팝업
    // ------------------------------------------------
    function bindQRPopup() {
        const btnQR = document.getElementById("qr-btn");
        const popup = document.getElementById("qr-popup");
        const holder = document.getElementById("qr-holder");
        const btnClose = document.getElementById("qr-close");

        if (btnQR && popup && holder) {
            btnQR.addEventListener("click", () => {
                popup.style.display = "flex";
                holder.innerHTML = "";
                new QRCode(holder, {
                    text: "https://cube.3arch2nd.site",
                    width: 180,
                    height: 180
                });
            });
        }

        if (btnClose && popup) {
            btnClose.addEventListener("click", () => {
                popup.style.display = "none";
            });
        }
    }

})();
