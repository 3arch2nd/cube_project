// main.js
// 정육면체 전개도 / 겹치는 부분 찾기 통합 메인 로직
// 의존: cube_nets.js, foldEngine.js, validator.js, overlap.js, ui.js, three.js

(function () {
    'use strict';

    // ------------------------------
    // 전역 상태
    // ------------------------------
    const PAGES = {
        MODE: 'mode-selection-page',
        SETUP: 'setup-page',
        PROBLEM: 'problem-page',
        RESULT: 'final-result-page'
    };

    const PROBLEM_TYPE = {
        PIECE: 'piece',       // 조각 놓기 (하나 떼어낸 전개도 조각 위치 맞추기)
        OVERLAP: 'overlap',   // 겹치는 부분 찾기
        BOTH: 'both'          // 두 유형 섞어서 출제
    };

    const GAME_MODE = {
        CLASSIC: 'classic',
        TIME_ATTACK: 'timeAttack' // 구조만 남겨두고 필요시 확장
    };

    let gameMode = GAME_MODE.CLASSIC;
    let selectedProblemType = PROBLEM_TYPE.PIECE;
    let totalProblems = 5;

    let problems = [];           // [{ kind: 'piece'|'overlap', net }]
    let currentIndex = 0;
    let currentProblem = null;

    // 결과 기록: { correct: boolean, attempts: number }
    let resultLog = [];

    // 화면 요소 참조
    let netCanvas, netCtx;
    let threeCanvasOrDiv;

    // 현재 문제에서 정답 시도 횟수
    let currentAttempts = 0;

    // ------------------------------
    // 유틸: 페이지 전환
    // ------------------------------
    function showPage(pageIdToShow) {
        Object.values(PAGES).forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = (id === pageIdToShow) ? 'block' : 'none';
        });
    }

    // ------------------------------
    // 모드 선택 / 설정 관련
    // ------------------------------
    function bindModeButtons() {
        const classicBtn = document.getElementById('classic-mode-btn');
        const timeAttackBtn = document.getElementById('time-attack-mode-btn');

        if (classicBtn) {
            classicBtn.addEventListener('click', () => {
                gameMode = GAME_MODE.CLASSIC;
                classicBtn.classList.add('mode-btn-active');
                if (timeAttackBtn) timeAttackBtn.classList.remove('mode-btn-active');
                showPage(PAGES.SETUP);
            });
        }

        if (timeAttackBtn) {
            // 일단 구조만 맞춰두고, 나중에 실제 타임어택 로직을 넣어도 됨
            timeAttackBtn.addEventListener('click', () => {
                gameMode = GAME_MODE.TIME_ATTACK;
                timeAttackBtn.classList.add('mode-btn-active');
                if (classicBtn) classicBtn.classList.remove('mode-btn-active');
                showPage(PAGES.SETUP);
            });
        }
    }

    function bindTypeButtons() {
        const typeButtons = document.querySelectorAll('#type-select button');
        typeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                typeButtons.forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedProblemType = btn.getAttribute('data-type') || PROBLEM_TYPE.PIECE;
            });
        });
    }

    function bindSetupControls() {
        // 문제 개수 (클래식 모드 기준, symmetry처럼 +/- 5)
        const qMinus = document.getElementById('quantity-minus');
        const qPlus = document.getElementById('quantity-plus');
        const qDisplay = document.getElementById('problem-quantity');

        if (qDisplay) {
            totalProblems = parseInt(qDisplay.textContent || '5', 10);
        }

        if (qMinus && qPlus && qDisplay) {
            qMinus.addEventListener('click', () => {
                let current = parseInt(qDisplay.textContent || '5', 10);
                current = Math.max(1, current - 5);
                qDisplay.textContent = current;
                totalProblems = current;
            });
            qPlus.addEventListener('click', () => {
                let current = parseInt(qDisplay.textContent || '5', 10);
                current = Math.min(50, current + 5);
                qDisplay.textContent = current;
                totalProblems = current;
            });
        }

        const startBtn = document.getElementById('start-quiz-btn');
        if (startBtn) {
            startBtn.addEventListener('click', startQuiz);
        }

        const backBtn = document.getElementById('back-to-mode-select-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                if (confirm('설정을 취소하고 모드 선택 화면으로 돌아갈까요?')) {
                    showPage(PAGES.MODE);
                }
            });
        }
    }

    // ------------------------------
    // 문제 생성
    // ------------------------------
    function createSingleProblem(kind) {
        if (kind === PROBLEM_TYPE.PIECE) {
            // cube_nets.js에서 제공하는 API라고 가정
            const prob = CubeNets.getRandomPieceProblem();
            return {
                kind: PROBLEM_TYPE.PIECE,
                net: prob.net,
                removedFaceId: prob.removedFaceId
            };
        } else if (kind === PROBLEM_TYPE.OVERLAP) {
            const prob = CubeNets.getRandomOverlapProblem();
            return {
                kind: PROBLEM_TYPE.OVERLAP,
                net: prob.net
            };
        }
        // 기본은 PIECE
        const prob = CubeNets.getRandomPieceProblem();
        return {
            kind: PROBLEM_TYPE.PIECE,
            net: prob.net,
            removedFaceId: prob.removedFaceId
        };
    }

    function generateProblems() {
        problems = [];
        resultLog = [];
        currentIndex = 0;

        const count = (gameMode === GAME_MODE.CLASSIC) ? totalProblems : 9999; // 타임어택은 나중에 조정

        for (let i = 0; i < count; i++) {
            let kind;
            if (selectedProblemType === PROBLEM_TYPE.BOTH) {
                kind = (Math.random() < 0.5) ? PROBLEM_TYPE.PIECE : PROBLEM_TYPE.OVERLAP;
            } else {
                kind = selectedProblemType;
            }
            problems.push(createSingleProblem(kind));
        }
    }

    // ------------------------------
    // 문제 진행
    // ------------------------------
    function startQuiz() {
        generateProblems();

        if (!problems.length) {
            alert('문제를 생성하지 못했습니다. 다시 시도해 주세요.');
            return;
        }

        showPage(PAGES.PROBLEM);
        currentIndex = 0;
        currentAttempts = 0;
        loadCurrentProblem();
    }

    function loadCurrentProblem() {
        currentProblem = problems[currentIndex];
        currentAttempts = 0;

        if (!currentProblem) {
            showFinalResult();
            return;
        }

        // 문제 번호 / 설명 표시
        const numberEl = document.getElementById('problem-number');
        const descEl = document.getElementById('problem-instruction');

        if (numberEl) {
            numberEl.textContent = `${currentIndex + 1}번째 문제`;
        }

        if (descEl) {
            if (currentProblem.kind === PROBLEM_TYPE.PIECE) {
                descEl.textContent = '전개도의 빈 칸에 알맞은 조각을 놓아, 접었을 때 완전한 정육면체가 되도록 하세요.';
            } else {
                descEl.textContent = '정육면체를 접었을 때 서로 맞닿아 겹치게 되는 두 면을 골라 보세요.';
            }
        }

        // 2D 전개도 그리기
        if (netCtx && currentProblem.net) {
            NetRenderer.drawNet(netCtx, currentProblem.net);
        }

        // Overlap 모듈 초기화 (2D 상호작용 담당)
        if (netCanvas && currentProblem.net) {
            Overlap.reset && Overlap.reset();
            Overlap.init && Overlap.init(netCanvas, currentProblem.net);
            Overlap.setMode && Overlap.setMode(currentProblem.kind);
        }

        // 버튼 초기 상태
        const checkBtn = document.getElementById('check-answer-btn');
        const nextBtn = document.getElementById('next-problem-btn');

        if (checkBtn) checkBtn.style.display = 'inline-block';
        if (nextBtn) nextBtn.style.display = 'none';
    }

    function checkAnswer() {
        if (!currentProblem) return;

        let isCorrect = false;
        if (currentProblem.kind === PROBLEM_TYPE.PIECE) {
            isCorrect = UI.checkPieceResult(currentProblem.net);
        } else {
            isCorrect = UI.checkOverlapResult(currentProblem.net);
        }

        currentAttempts++;

        // 결과 기록
        resultLog[currentIndex] = resultLog[currentIndex] || { correct: false, attempts: 0 };
        if (isCorrect) {
            if (!resultLog[currentIndex].correct) {
                resultLog[currentIndex].correct = true;
                resultLog[currentIndex].attempts = currentAttempts - 1; // 0번 시도면 한 번에 맞춤
            }
        }

        // UI 피드백
        if (isCorrect) {
            alert('정답입니다! 🎉');
            const checkBtn = document.getElementById('check-answer-btn');
            const nextBtn = document.getElementById('next-problem-btn');
            if (checkBtn) checkBtn.style.display = 'none';
            if (nextBtn) nextBtn.style.display = 'inline-block';
        } else {
            alert('아쉽습니다. 다시 한 번 생각해 보세요!');
        }
    }

    function gotoNextProblem() {
        currentIndex++;
        if (currentIndex >= problems.length || gameMode === GAME_MODE.TIME_ATTACK) {
            // 타임어택 모드는 나중에 타이머 종료 기준으로도 끝낼 수 있음
            showFinalResult();
        } else {
            loadCurrentProblem();
        }
    }

    // ------------------------------
    // 접기 애니메이션 버튼
    // ------------------------------
    function playFoldAnimation() {
        if (!currentProblem || !currentProblem.net) return;
        UI.showFoldedCube(currentProblem.net, () => {
            // 애니메이션 끝난 뒤 추가로 할 작업이 있으면 여기에
            // 예: console.log('Fold animation finished');
        });
    }

    // ------------------------------
    // 결과 화면
    // ------------------------------
    function showFinalResult() {
        showPage(PAGES.RESULT);

        const correctCountEl = document.getElementById('correct-count');
        const retriedCountEl = document.getElementById('retried-count');
        const accuracyEl = document.getElementById('final-accuracy');

        let correct = 0;
        let retried = 0;
        let totalWeighted = 0;
        let total = resultLog.length;

        resultLog.forEach(r => {
            if (!r) return;
            if (r.correct) {
                if (r.attempts === 0) {
                    correct++;
                    totalWeighted += 1;
                } else {
                    retried++;
                    totalWeighted += Math.max(0, 1 - r.attempts * 0.4);
                }
            }
        });

        const accuracy = total ? ((totalWeighted / total) * 100).toFixed(1) : '0.0';

        if (correctCountEl) correctCountEl.textContent = correct;
        if (retriedCountEl) retriedCountEl.textContent = retried;
        if (accuracyEl) accuracyEl.textContent = `${accuracy}%`;
    }

    // ------------------------------
    // 다시 시작
    // ------------------------------
    function bindResultButtons() {
        const restartBtn = document.getElementById('restart-btn');
        if (restartBtn) {
            restartBtn.addEventListener('click', () => {
                if (confirm('다시 처음부터 시작할까요?')) {
                    problems = [];
                    resultLog = [];
                    currentIndex = 0;
                    currentProblem = null;
                    showPage(PAGES.MODE);
                }
            });
        }
    }

    // ------------------------------
    // 메인 초기화
    // ------------------------------
    function init() {
        netCanvas = document.getElementById('net-canvas');
        threeCanvasOrDiv = document.getElementById('three-view');

        if (netCanvas) {
            netCtx = netCanvas.getContext('2d');
        }

        // UI 및 이벤트 바인딩
        bindModeButtons();
        bindTypeButtons();
        bindSetupControls();
        bindResultButtons();

        // 채점 버튼 / 다음 문제 버튼 / 접기 애니메이션 버튼
        const checkBtn = document.getElementById('check-answer-btn');
        const nextBtn = document.getElementById('next-problem-btn');
        const foldBtn = document.getElementById('fold-anim-btn');

        if (checkBtn) checkBtn.addEventListener('click', checkAnswer);
        if (nextBtn) nextBtn.addEventListener('click', gotoNextProblem);
        if (foldBtn) foldBtn.addEventListener('click', playFoldAnimation);

        // 첫 화면은 모드 선택
        showPage(PAGES.MODE);
    }

    document.addEventListener('DOMContentLoaded', init);
})();
