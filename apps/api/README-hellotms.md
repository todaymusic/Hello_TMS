# (참고) hellotms 배포 안내

hellotms는 **기존 TMS 백엔드(tms-production-6ba9)와 DB를 공유**합니다.
따라서 **이 api 폴더는 Railway에 배포하지 않아도 됩니다** — web 서비스만 배포하세요.

(나중에 데이터까지 완전히 분리하려면: 이 api를 별도 서비스+새 Postgres로 배포하고,
 web의 NEXT_PUBLIC_API_URL을 그 새 api 주소로 설정)
