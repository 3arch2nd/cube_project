/**
 * main.js – 완전 통합 버전 (정육면체 전용)
 */

(function () {
    "use strict";

    // 전역 프로젝트 상태 객체 (안정성 강화)
    window.CubeProject = {};

    // ------------------------------------------------------
    // ENUMS (UI.js에서 접근 가능하도록 window.CubeProject에 등록)
    // ------------------------------------------------------
    const MAIN_MODE = {
        NET_BUILD: "netBuild",
        OVERLAP_FIND: "overlapFind"
    };
    window.CubeProject.MAIN_MODE = MAIN_MODE; 

    // ⭐ 정육면체 전용이므로 NET_TYPE, SOLID_TYPE 등 단순화
    const NET_TYPE = { CUBE: "cube" }; 
    const SOLID_TYPE = { CUBE: "cube" };

    const OVERLAP_MODE = { POINT: "point", EDGE: "edge", BOTH: "both" };

    const RUN_MODE = { PRACTICE: "practice", REAL: "real" };

    // ------------------------------------------------------
    // 상태 변수
    // ------------------------------------------------------
    let mainMode = null;
    let overlapMode = OVERLAP_MODE.BOTH; // 기본값 설정 (선택 안 했을 경우 대비)

    let runMode = RUN_MODE.PRACTICE;
    let problemCount = 10;

    let problems = [];
    let currentIndex = 0;
    let currentProblem = null;
    window.CubeProject.currentProblem = currentProblem; 

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

        // 초기 선택 버튼 selected 상태 지정 (정육면체 디폴트)
        document.querySelector("#net-run-group button[data-run='practice']").classList.add("selected");
        document.querySelector("#ov-type-group button[data-type='both']").classList.add("selected");
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

        pages.forEach(id => {
            const pageElement = document.getElementById(id);
            if (pageElement) {
                pageElement.classList.add("hidden");
            }
        });
        
        const targetPage = document.getElementById(pageId);
        if (targetPage) {
            targetPage.classList.remove("hidden");
        }
    }

    // ------------------------------------------------------
    // MODE SELECT PAGE
    // ------------------------------------------------------
    function bindModeSelectPage() {
        document.getElementById("btn-mode-net").addEventListener("click", () => {
            mainMode = MAIN_MODE.NET_BUILD;
            document.getElementById("setup-overlap").classList.add("hidden");
            document.getElementById("mode-select-page").classList.add("hidden");
            document.getElementById("setup-net").classList.remove("hidden");
        });

        document.getElementById("btn-mode-overlap").addEventListener("click", () => {
            mainMode = MAIN_MODE.OVERLAP_FIND;
            document.getElementById("setup-net").classList.add("hidden");
            document.getElementById("mode-select-page").classList.add("hidden");
            document.getElementById("setup-overlap").classList.remove("hidden");
        });
    }

    // ------------------------------------------------------
    // NET BUILD SETUP PAGE (정육면체 전용)
    // ------------------------------------------------------
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

    // ------------------------------------------------------
    // OVERLAP SETUP PAGE (정육면체 전용)
    // ------------------------------------------------------
    function bindOverlapSetupPage() {

        // 겹침 유형
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
        const p = CubeNets.getRandomPieceProblem();
        return {
            mode: MAIN_MODE.NET_BUILD,
            solid: "cube",
            net: p.net,
            dims: null // 정육면체이므로 dims 없음
        };
    }

    /** 2) 겹침 문제 생성 */
    function generateOneOverlapProblem() {
        const netObj = CubeNets.getRandomOverlapProblem(overlapMode);
        
        return {
            mode: MAIN_MODE.OVERLAP_FIND,
            solid: "cube",
            net: netObj.net,
            dims: null, // 정육면체이므로 dims 없음
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
    // LOAD 1 PROBLEM (⭐ Async/Await 적용)
    // ------------------------------------------------------
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

        // UI 초기화
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
        
        const netFor3D = JSON.parse(JSON.stringify(currentProblem.net));
        
        if (currentProblem.mode === MAIN_MODE.NET_BUILD) {
            const removedId = window.UI.getRemovedFaceId(); 
            const removedFaceIndex = netFor3D.faces.findIndex(f => f.id === removedId);
            
            if (removedFaceIndex !== -1) {
                netFor3D.faces.splice(removedFaceIndex, 1);
            }
        }
        
        // ⭐ await 추가: loadNet이 Promise를 반환하므로 완료될 때까지 기다림
        await FoldEngine.loadNet(netFor3D); 
        FoldEngine.unfoldImmediate(); 
        
        if (currentProblem.mode === MAIN_MODE.OVERLAP_FIND) {
            Overlap.startSelection(currentProblem.net);
        }
    }

    // ------------------------------------------------------
    // ANSWER CHECK / NEXT (⭐ Async/Await 적용)
    // ------------------------------------------------------
    function bindProblemButtons() {

        document.getElementById("btn-check").addEventListener("click", async () => { // ⭐ async 추가
            
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
                         netForFold.faces.push({ id: removedId, u: placedPos.u, v: placedPos.v, w: placedPos.w, h: placedPos.h });
                         netForFold.faces.sort((a,b) => a.id - b.id);
                    }
                } else {
                    document.getElementById("btn-check").disabled = false;
                    alert("조각이 배치되지 않았습니다.");
                    return;
                }

                // ⭐ await 추가: 6조각 전체를 로드하고 안정화될 때까지 기다림
                await FoldEngine.loadNet(netForFold); 
                
                // Validator는 동기적으로 실행
                correct = Validator.validateNet(netForFold); 

            } else { // OVERLAP_FIND 모드
                // ⭐ await 추가: 6조각 전체를 로드하고 안정화될 때까지 기다림
                await FoldEngine.loadNet(netForFold); 
                correct = window.Overlap.checkUserAnswer(netForFold);
            }

            // 3D 모델을 펼친 상태에서 접는 애니메이션 실행
FoldEngine.unfoldImmediate();

FoldEngine.foldAnimate(1.0)
    .then(() => FoldEngine.showSolvedView(1.5))
    .then(() => {
        if (correct) {
            alert("정답입니다! 🎉");
            document.getElementById("btn-check").classList.add("hidden");
            document.getElementById("btn-next").classList.remove("hidden");
        } else {
            alert("틀렸습니다. 다시 생각해 볼까요? 🤔\n" + Validator.lastError);

            document.getElementById("btn-check").disabled = false;

            setTimeout(() => {
                FoldEngine.unfoldImmediate();

                if (currentProblem.mode === MAIN_MODE.OVERLAP_FIND) {
                    Overlap.startSelection(currentProblem.net);
                    UI.renderNet(currentProblem.net, {});
                } else {
                    loadProblem();
                }
            }, 1500);
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
        const correctCount = currentIndex; 
        
        showPage("result-page");
        document.getElementById("result-acc").textContent =
            `${((correctCount / problemCount) * 100).toFixed(1)}%`;

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
