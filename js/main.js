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
    // PAGE SWITCH (⭐ 수정됨: 모든 페이지를 명확히 숨기고, 원하는 페이지를 표시)
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
            showPage("setup-net");
        });

        document.getElementById("btn-mode-overlap").addEventListener("click", () => {
            mainMode = MAIN_MODE.OVERLAP_FIND;
            showPage("setup-overlap");
        });
    }

    // ------------------------------------------------------
    // NET BUILD SETUP PAGE (정육면체 전용)
    // ------------------------------------------------------
    function bindNetSetupPage() {

        // ⭐ 입체 종류 버튼 로직 제거 (항상 정육면체)

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

        // ⭐ 입체 종류 버튼 로직 제거 (항상 정육면체)

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
    // LOAD 1 PROBLEM
    // ------------------------------------------------------
    function loadProblem() {

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

        // UI 초기화: 반드시 init → clear 순서
        UI.init(netCanvas);
        UI.clear();

        const opt = {};
        if (currentProblem.mode === MAIN_MODE.NET_BUILD) {
            opt.removeOne = true;
            opt.highlightPositions = true;
        }

        // 전개도 렌더링 (UI 쪽에서 removedFaceId가 설정됨)
        UI.renderNet(currentProblem.net, opt);
        
        // 3D 초기화
        FoldEngine.init(threeCanvas);
        
        // 3D 뷰 초기화: 제거된 조각만 제외하고 5조각만 보이도록 처리
        const netFor3D = JSON.parse(JSON.stringify(currentProblem.net));
        
        if (currentProblem.mode === MAIN_MODE.NET_BUILD) {
            const removedId = window.UI.getRemovedFaceId(); 
            const removedFaceIndex = netFor3D.faces.findIndex(f => f.id === removedId);
            
            if (removedFaceIndex !== -1) {
                // 해당 조각을 배열에서 제거 (5조각만 로드)
                netFor3D.faces.splice(removedFaceIndex, 1);
            }
        }
        
        FoldEngine.loadNet(netFor3D);
        FoldEngine.unfoldImmediate(); 
        
        // 겹침 모드라면 Overlap 초기화
        if (currentProblem.mode === MAIN_MODE.OVERLAP_FIND) {
            Overlap.startSelection(currentProblem.net);
            // Overlap.js에 overlapMode는 필요 없으므로 삭제
        }
    }

    // ------------------------------------------------------
    // ANSWER CHECK / NEXT
    // ------------------------------------------------------
    function bindProblemButtons() {

        document.getElementById("btn-check").addEventListener("click", () => {
            
            document.getElementById("btn-check").disabled = true;

            // 정답 확인 및 FoldEngine 로드
            let correct = false;

            if (currentProblem.mode === MAIN_MODE.NET_BUILD) {
                // UI.checkPieceResult 내부에서 netClone(정답 포함)을 FoldEngine에 로드
                correct = UI.checkPieceResult(currentProblem.net);
            } else {
                // 겹침 찾기 모드: 현재 문제 net을 FoldEngine에 로드
                // Overlap.js에서 3D 시뮬레이션을 위해 FoldEngine에 로드해야 할 수도 있으나,
                // 현재 구조상 Validator에서 loadNet이 호출되거나, UI.checkOverlapResult 내부에
                // FoldEngine.loadNet이 있어야 합니다.
                // UI.checkOverlapResult는 Overlap.checkUserAnswer를 호출하며, 이 함수는 FoldEngine.getFaceGroups()를
                // 통해 3D 위치를 얻습니다. 따라서 겹침 모드에서는 5조각이 아닌 6조각 전체를 로드해야 합니다.
                
                // 겹침 찾기 모드에서는 항상 6조각이므로, 현재 net을 FoldEngine에 로드
                FoldEngine.loadNet(currentProblem.net); // 6조각 전체 로드
                correct = UI.checkOverlapResult(currentProblem.net);
            }
            
            // 오답 시에도 접힘 애니메이션 실행 (학습 효과)
            FoldEngine.foldAnimate(1) // ⭐ 수정된 foldAnimate 호출
                .then(() => {
                    if (correct) {
                        alert("정답입니다! 🎉");
                        document.getElementById("btn-check").classList.add("hidden");
                        document.getElementById("btn-next").classList.remove("hidden");
                    } else {
                        alert("틀렸습니다. 다시 생각해 볼까요? 🤔");
                        
                        document.getElementById("btn-check").disabled = false; 
                        
                        // 오답 시: 잠시 후 다시 펼쳐서 사용자가 재시도할 수 있도록 함
                        setTimeout(() => {
                            FoldEngine.unfoldImmediate();
                            
                            if (currentProblem.mode === MAIN_MODE.OVERLAP_FIND) {
                                // 겹침 문제는 선택 초기화 후 UI 렌더링
                                Overlap.startSelection(currentProblem.net);
                                UI.renderNet(currentProblem.net, {}); 
                            } else {
                                // 전개도 완성하기는 5조각만 다시 보이도록 FoldEngine 재로드
                                // loadProblem()을 호출하여 5조각 상태로 재설정
                                loadProblem(); 
                            }
                        }, 1500); // 1.5초 후 펼치기
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
        // 임시 정답률: 연습 모드에서는 실제 정답 기록이 없으므로 문제 수로 대체
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
