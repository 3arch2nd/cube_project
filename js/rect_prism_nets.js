/**
 * RectPrismNets
 * 직육면체 전개도용 모듈
 *
 * dims = { a, b, c }
 * - 윗면/밑면: a × b
 * - 옆면: a × c (2개), b × c (2개)
 */

window.RectPrismNets = (function () {
    const API = {};

    // ------------------------------
    // 직육면체 전개도 생성 함수
    // ------------------------------
    function makeNet(a, b, c, layoutId) {
        let faces = [];

        // Face ID 규칙:
        // 0 = 윗면(a×b)
        // 1 = 밑면(a×b)
        // 2 = 앞면(a×c)
        // 3 = 뒷면(a×c)
        // 4 = 왼쪽(b×c)
        // 5 = 오른쪽(b×c)

        switch (layoutId) {

            /** 타입 1 — 십자형 기본 전개도
             *
             *       [5]
             * [4] [2] [3] [5]
             *       [1]
             */
            case 1:
                faces = [
                    { id:0, u:1, v:0, w:a, h:b },
                    { id:1, u:1, v:2, w:a, h:b },
                    { id:2, u:1, v:1, w:a, h:c },
                    { id:3, u:2, v:1, w:a, h:c },
                    { id:4, u:0, v:1, w:b, h:c },
                    { id:5, u:3, v:1, w:b, h:c },
                ];
                break;

            /** 타입 2 — 윗면 중심, 양쪽으로 확장 */
            case 2:
                faces = [
                    { id:0, u:1, v:1, w:a, h:b },
                    { id:1, u:1, v:3, w:a, h:b },
                    { id:2, u:1, v:2, w:a, h:c },
                    { id:3, u:1, v:0, w:a, h:c },
                    { id:4, u:0, v:1, w:b, h:c },
                    { id:5, u:2, v:1, w:b, h:c },
                ];
                break;

            /** 타입 3 — 가로로 길게 연결되는 형 */
            case 3:
                faces = [
                    { id:0, u:1, v:1, w:a, h:b },
                    { id:1, u:1, v:2, w:a, h:b },
                    { id:2, u:0, v:1, w:a, h:c },
                    { id:3, u:2, v:1, w:a, h:c },
                    { id:4, u:3, v:1, w:b, h:c },
                    { id:5, u:4, v:1, w:b, h:c },
                ];
                break;

            /** 타입 4 — 세로로 길게 */
            case 4:
                faces = [
                    { id:0, u:1, v:1, w:a, h:b },
                    { id:1, u:1, v:3, w:a, h:b },
                    { id:2, u:1, v:0, w:a, h:c },
                    { id:3, u:1, v:4, w:a, h:c },
                    { id:4, u:0, v:1, w:b, h:c },
                    { id:5, u:2, v:1, w:b, h:c },
                ];
                break;

            /** 타입 5 — ㄴ자 구조 */
            case 5:
                faces = [
                    { id:0, u:1, v:1, w:a, h:b },
                    { id:1, u:1, v:2, w:a, h:b },
                    { id:2, u:2, v:1, w:a, h:c },
                    { id:3, u:0, v:1, w:a, h:c },
                    { id:4, u:0, v:2, w:b, h:c },
                    { id:5, u:2, v:2, w:b, h:c },
                ];
                break;

            /** 타입 6 — 역 ㄴ자 */
            case 6:
                faces = [
                    { id:0, u:1, v:1, w:a, h:b },
                    { id:1, u:1, v:2, w:a, h:b },
                    { id:2, u:0, v:1, w:a, h:c },
                    { id:3, u:2, v:1, w:a, h:c },
                    { id:4, u:2, v:2, w:b, h:c },
                    { id:5, u:0, v:2, w:b, h:c },
                ];
                break;

            default:
                return null;
        }

        return { id: layoutId, faces };
    }

    // ------------------------------
    // 임의 직육면체 문제 생성
    // ------------------------------
    API.getRandomRectNet = function () {

        // 간단한 교육용 크기 집합 (추후 확장 가능)
        const dimSet = [
            { a:2, b:3, c:1 },
            { a:3, b:2, c:1 },
            { a:4, b:2, c:1 },
            { a:3, b:3, c:2 },
        ];

        const choice = dimSet[Math.floor(Math.random() * dimSet.length)];

        const layoutId = 1 + Math.floor(Math.random() * 6); // 1~6

        const net = makeNet(choice.a, choice.b, choice.c, layoutId);

        return {
            dims: choice,
            net,
            layoutId
        };
    };

    return API;
})();
