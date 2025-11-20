/**
 * main.js – FoldEngine 최신 접기 시스템과 완전 호환되는 버전
 *  - 좌우반전/색 랜덤 절대 없음
 *  - 슬라이더로 접기/펼치기 정상 제어
 *  - 문제 전환 시 상태 완전 초기화
 */

(function () {
    "use strict";

    window.CubeProject = {};

    const MAIN_MODE = {
        NET_BUILD: "netBuild",
        OVERLAP_FIND: "overlapFind"
    };

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
    let engine = null;
    let scene = null;

    // ------------------------------------------------------------
    // 초기화
    // ------------------------------------------------------------
    document.addEventListener("DOMContentLoaded", init);

    function init() {
        netCanvas = document.getElementById("net-canvas");
        threeCanvas = document.getElementById("three-view");

        // Babylon 엔진 준비
        engine = new BABYLON.Engine(threeCanvas, true);
        scene = new BABYLON.Scene(engine);
        window.engine = engine;
        window.scene = scene;

        // FoldEngine 초기화
        FoldEngine.init(threeCanvas, engine, scene);

        // Babylon render loop
        engine.runRenderLoop(() => scene.render());

        window.addEventListener("resize", () => {
            engine.resize();
            if (FoldEngine.onResize) FoldEngine.onResize();
        });

        bindModeSelectPage();
        bindNetSetupPage();
        bindOverlapSetupPage();
        bindProblemButtons();
        bindQRPopup();
        bindFoldSlider();

        document.getElementById("fold-control").classList.add("hidden");
        showPage("mode-select-page");
    }

    // ------------------------------------------------------------
    // 페이지 전환
    // ------------------------------------------------------------
    function showPage(id) {
        ["mode-select-page","setup-net","setup-overlap","problem-page","result-page"]
        .forEach(p => document.getElementById(p).classList.add("hidden"));

        document.getElementById(id).classList.remove("hidden");

        // 슬라이더 노출 여부
        if (id === "problem-page") {
            document.getElementById("fold-control").classList.remove("hidden");
        } else {
            document.getElementById("fold-control").classList.add("hidden");
        }
    }

    // ------------------------------------------------------------
    // 모드 선택
    // ------------------------------------------------------------
    function bindModeSelectPage() {
        document.getElementById("btn-mode-net").onclick = () => {
            mainMode = MAIN_MODE.NET_BUILD;
            showPage("setup-net");
        };
        document.getElementById("btn-mode-overlap").onclick = () => {
            mainMode = MAIN_MODE.OVERLAP_FIND;
            showPage("setup-overlap");
        };
    }

    // ------------------------------------------------------------
    // 전개도 완성하기 설정
    // ------------------------------------------------------------
    function bindNetSetupPage() {
        document.querySelectorAll("#net-run-group button").forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll("#net-run-group button")
                .forEach(b => b.classList.remove("selected"));
                btn.classList.add("selected");
                runMode = btn.dataset.run;
            };
        });

        const disp = document.getElementById("net-q-display");
        document.getElementById("net-q-minus").onclick = () => {
            problemCount = Math.max(1, problemCount - 1);
            disp.textContent = problemCount;
        };
        document.getElementById("net-q-plus").onclick = () => {
            problemCount = Math.min(50, problemCount + 1);
            disp.textContent = problemCount;
        };

        document.getElementById("start-net").onclick = startNetProblems;
    }

    // ------------------------------------------------------------
    function bindOverlapSetupPage() {
        document.querySelectorAll("#ov-type-group button").forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll("#ov-type-group button")
                .forEach(b => b.classList.remove("selected"));
                btn.classList.add("selected");
                overlapMode = btn.dataset.type;
            };
        });

        document.querySelectorAll("#ov-run-group button").forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll("#ov-run-group button")
                .forEach(b => b.classList.remove("selected"));
                btn.classList.add("selected");
                runMode = btn.dataset.run;
            };
        });

        const disp = document.getElementById("ov-q-display");
        document.getElementById("ov-q-minus").onclick = () => {
            problemCount = Math.max(1, problemCount - 1);
            disp.textContent = problemCount;
        };
        document.getElementById("ov-q-plus").onclick = () => {
            problemCount = Math.min(50, problemCount + 1);
            disp.textContent = problemCount;
        };

        document.getElementById("start-overlap").onclick = startOverlapProblems;
    }

    // ------------------------------------------------------------
    // 문제 생성
    // ------------------------------------------------------------
    function generateOneNetProblem() {
        const p = CubeNets.getRandomPieceProblem();
        return { mode: MAIN_MODE.NET_BUILD, solid: "cube", net: p.net };
    }

    function generateOneOverlapProblem() {
        const p = CubeNets.getRandomOverlapProblem(overlapMode);
        return { mode: MAIN_MODE.OVERLAP_FIND, solid:"cube", net:p.net, overlapMode };
    }

    // ------------------------------------------------------------
    function startNetProblems() {
        problems = Array.from({length:problemCount}, () => generateOneNetProblem());
        currentIndex = 0;
        showPage("problem-page");
        loadProblem();
    }

    function startOverlapProblems() {
        problems = Array.from({length:problemCount}, () => generateOneOverlapProblem());
        currentIndex = 0;
        showPage("problem-page");
        loadProblem();
    }

    // ------------------------------------------------------------
    // 문제 로딩
    // ------------------------------------------------------------
    async function loadProblem() {

        currentProblem = problems[currentIndex];
        window.CubeProject.currentProblem = currentProblem;

        if (!currentProblem) return showResultPage();

        // UI 버튼 상태
        document.getElementById("btn-next").classList.add("hidden");
        const btnCheck = document.getElementById("btn-check");
        btnCheck.classList.remove("hidden");
        btnCheck.disabled = false;

        // 슬라이더 초기화
        const foldSlider = document.getElementById("fold-slider");
        foldSlider.value = 0;
        foldSlider.disabled = false;
        document.getElementById("slider-value").textContent = "0.00";

        // 제목
        const idx = currentIndex + 1;
        document.getElementById("problem-title").textContent =
            currentProblem.mode === MAIN_MODE.NET_BUILD
            ? `전개도 완성하기 (${idx}/${problemCount})`
            : `겹쳐지는 부분 찾기 (${idx}/${problemCount})`;

        // 2D 화면 구성
        UI.init(netCanvas);
        UI.clear();
        UI.renderNet(currentProblem.net, {
            highlightPositions: currentProblem.mode === MAIN_MODE.NET_BUILD
        });

        // 3D 데이터 준비
        const threeNet = JSON.parse(JSON.stringify(currentProblem.net));

        // 빠진 조각은 foldEngine에서 투명 처리
        if (currentProblem.mode === MAIN_MODE.NET_BUILD) {
            const removedId = UI.getRemovedFaceId();
            threeNet.faces.forEach(f => {
                if (f.id === removedId) f._hidden = true;
            });
        }

        await FoldEngine.loadNet(threeNet);   // 이미 펼친 상태로 자동 배치됨
        FoldEngine.unfoldImmediate();         // (안전용)
        
        if (currentProblem.mode === MAIN_MODE.OVERLAP_FIND) {
            Overlap.startSelection(currentProblem.net);
        }
    }

    // ------------------------------------------------------------
    // 슬라이더로 foldEngine 제어
    // ------------------------------------------------------------
    function bindFoldSlider() {
        const slider = document.getElementById("fold-slider");
        const label = document.getElementById("slider-value");

        slider.oninput = () => {
            const t = Number(slider.value);
            label.textContent = t.toFixed(2);
            FoldEngine.foldTo(t);
        };
    }

    // ------------------------------------------------------------
    // 정답 확인
    // ------------------------------------------------------------
    function bindProblemButtons() {

        document.getElementById("btn-check").onclick = async () => {

            const slider = document.getElementById("fold-slider");
            slider.disabled = true;

            let correct = false;
            let netForCheck = JSON.parse(JSON.stringify(currentProblem.net));

            if (currentProblem.mode === MAIN_MODE.NET_BUILD) {

                const placed = UI.placed;
                if (!placed) {
                    alert("조각이 배치되지 않았습니다.");
                    slider.disabled = false;
                    return;
                }

                const removedId = UI.getRemovedFaceId();
                const face = netForCheck.faces.find(f => f.id === removedId);

                if (face) {
                    face.u = placed.u;
                    face.v = placed.v;
                } else {
                    netForCheck.faces.push({
                        id: removedId,
                        u: placed.u,
                        v: placed.v,
                        w: 1,
                        h: 1,
                        color: placed.color
                    });
                    netForCheck.faces.sort((a,b)=>a.id-b.id);
                }

                await FoldEngine.loadNet(netForCheck);
                correct = Validator.validateNet(netForCheck);

            } else {
                await FoldEngine.loadNet(netForCheck);
                correct = Overlap.checkUserAnswer(netForCheck);
            }

            // 정답/오답 상관 없이 접힌 상태로 보여줌
            FoldEngine.foldTo(1);
            slider.value = 1;
            document.getElementById("slider-value").textContent = "1.00";

            setTimeout(() => {
                if (correct) {
                    alert("정답입니다! 🎉");
                    document.getElementById("btn-check").classList.add("hidden");
                    document.getElementById("btn-next").classList.remove("hidden");
                    slider.disabled = false;
                } else {
                    alert("다시 시도해볼까요? 🤔");

                    setTimeout(() => {
                        FoldEngine.unfoldImmediate();
                        slider.disabled = false;
                        slider.value = 0;
                        document.getElementById("slider-value").textContent = "0.00";

                        if (currentProblem.mode===MAIN_MODE.OVERLAP_FIND) {
                            Overlap.startSelection(currentProblem.net);
                            UI.renderNet(currentProblem.net,{});
                        } else {
                            UI.renderNet(currentProblem.net,{highlightPositions:true});
                        }

                    }, 1400);
                }
            }, 50);
        };

        document.getElementById("btn-next").onclick = () => {
            currentIndex++;
            if (currentIndex >= problemCount) showResultPage();
            else loadProblem();
        };

        document.getElementById("btn-exit").onclick = () => {
            if (confirm("처음으로 돌아갈까요?")) showPage("mode-select-page");
        };
    }

    // ------------------------------------------------------------
    // 결과 페이지
    // ------------------------------------------------------------
    function showResultPage() {
        const acc = ((currentIndex/problemCount)*100).toFixed(1);
        showPage("result-page");
        document.getElementById("result-acc").textContent = `${acc}%`;
        document.getElementById("btn-restart").onclick = () => showPage("mode-select-page");
    }

    // ------------------------------------------------------------
    // QR 코드
    // ------------------------------------------------------------
    function bindQRPopup() {
        document.getElementById("qr-btn").onclick = () => {
            document.getElementById("qr-popup").style.display = "flex";
            const holder = document.getElementById("qr-holder");
            holder.innerHTML = "";
            new QRCode(holder, {
                text: "https://cube.3arch2nd.site",
                width: 180, height: 180
            });
        };

        document.getElementById("qr-close").onclick = () => {
            document.getElementById("qr-popup").style.display = "none";
        };
    }

})();
