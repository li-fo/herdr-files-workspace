# Herdr Files Workspace macOS 설치 및 테스트 기록

작성일: 2026-11-09

## 결과와 검증 범위

Windows용으로 안내된 Herdr Files Workspace를 macOS의 Herdr 0.1.14에 설치했다. 모드 소스는 수정하지 않고, macOS에서 실행할 별도의 Python 설치 스크립트를 작성했다. 두 모드의 검사와 레이아웃 활성화가 성공했으며, 실제 화면에서 Files 패널과 파일 목록 표시를 확인했다. 설치 후 사용자는 기본적인 작업에 큰 문제가 없다고 보고했다.

이후 사용자는 Markdown 미리보기, 로컬 파일 전송·삭제, 서버 접속 후 파일 전송·삭제도 정상 동작한다고 확인했다. 이는 사용자 실사용 확인이며, 이 문서 작성자가 별도 자동 테스트를 수행한 결과는 아니다.

macOS의 모든 기능에 대한 호환성 보증은 아니다. 원격 파일 편집, Mermaid 렌더링, 저장 충돌 처리 등은 아직 개별 검증 기록이 없다. 프로젝트 최소 요구 버전은 Herdr 0.1.13으로 유지한다. 이 macOS 설치 기록의 실제 검증 버전은 0.1.14다.

| 항목 | 값 |
| --- | --- |
| 저장소 | https://github.com/li-fo/herdr-files-workspace |
| 설치 커밋 | `e2f3339feb262deeb8f76ffd29849b39d838d8b8` |
| Herdr 버전 | 0.1.14 |
| OS | macOS; 세부 OS 버전은 기록하지 않음 |
| 설정 경로 | `/Users/young/.config/herdr-app` |
| 설치된 모드 | `files-workspace`, `files-workspace-header` |
| 활성 레이아웃 | `files-workspace` |
| Herdr 상태의 오류 목록 | `[]` |

## 관련 파일

- [macOS 설치 스크립트](./install-herdr-workspace-macos.py)
- [설치 직후 화면](./herdr-workspace-installed.png)
- 실제 백업: `/Users/young/.config/herdr-app/backups/files-workspace-macos-20261109-130215-985352`

설치 스크립트는 이 작업에서 별도로 작성한 파일이며, 저장소에 포함된 공식 macOS 설치 프로그램은 아니다.

## macOS 설치를 시도한 근거

설치 당시 저장소의 README와 WINDOWS.md는 Windows용 설치만 안내했다. 하지만 설치된 소스에는 macOS용 실행 경로가 남아 있었다. 현재 README는 이 기록과 사용자 후속 확인을 근거로 macOS의 설치 및 기본 사용 확인을 안내한다.

`mods/files-workspace/windows.js`의 핵심 분기는 다음과 같다.

```js
export const isWindows = () => window()?.platform === "windows";

export async function exec(command, args = [], options = {}) {
  if (!isWindows() || options.on) return nativeExec(command, args, options);
  // 이후 Windows 로컬 작업에 대한 변환 처리
}
```

따라서 macOS에서는 Windows PowerShell 변환을 거치지 않고 Herdr의 기본 `exec`로 명령을 실행한다. 소스에는 `osascript`, `open`, `sips`, `pbcopy`, `trash` 등 macOS용 명령도 남아 있다. 설치 당시 로컬 `/usr/bin/trash`와 `/usr/bin/scp`의 존재를 확인했다.

다만 이 분기가 존재한다는 사실만으로 모든 기능의 동작을 입증할 수는 없다.

## 설치 스크립트의 역할

공식 `install-windows.ps1`의 주요 설치 구성을 참고해 Python 스크립트로 구현했다. 기존 `install.sh`는 저장소 문서에서 현재 전체 Workspace 설치를 수행하지 않는 레거시 설치기로 설명하므로 사용하지 않았다.

스크립트는 다음 순서로 실행된다.

1. PATH에서 `herdr-app`을 찾고, 설정 폴더와 `layouts/main.json`을 확인한다.
2. `herdr-app status`로 실행 중인 Herdr에 접근 가능한지 확인한다.
3. 기존 `files-workspace` 레이아웃이 있으면 이를 읽고, 없으면 `main.json`을 읽어 별도 레이아웃을 준비한다.
4. Files 블록과 pane header 연결 구조 및 단축키 충돌을 검사한다.
5. 임시 폴더로 저장소 기본 브랜치의 최신 소스를 shallow clone한다.
6. 소스의 두 모드에 대해 `herdr-app check`를 실행한다.
7. 기존 모드·단축키·대상 레이아웃을 백업하고 설치 커밋과 대상 목록을 기록한다.
8. 두 모드 폴더를 복사하고 설치된 모드에 대해 다시 검사한다.
9. 단축키와 별도 레이아웃을 저장한다.
10. `files-workspace` 레이아웃으로 전환하고 상태를 출력한다.

Herdr 기본 `main.json`과 기본 `files`, `pane` 모드 코드는 수정하지 않는다. 모드 소스도 수정하지 않는다. 기존 전역·터미널 단축키 섹션을 유지하면서 `mod:files-workspace` 섹션에 필요한 항목을 병합한다.

| 키 | 연결 명령 |
| --- | --- |
| Cmd+S / Ctrl+S | `files-workspace.save` |
| Cmd+F / Ctrl+F | `files-workspace.find` |
| Cmd+Option+F / Ctrl+H | `files-workspace.replace` |

레이아웃 안의 Files 모드 참조는 `files-workspace`로, pane header 참조는 `files-workspace-header`로 연결한다. 이전 설치의 선택 색상 우회값 `#6699cc55`가 있으면 그 값만 제거한다.

## 실행 방법

Herdr를 실행한 상태에서 다음 명령을 실행한다.

```sh
python3 /Users/young/Downloads/test/install-herdr-workspace-macos.py
```

필요한 환경은 다음과 같다.

- PATH에서 실행 가능한 `herdr-app`, `git`, `python3`.
- GitHub에 접근할 수 있는 네트워크.
- Herdr 설정 폴더에 대한 쓰기 권한과 실행 중인 Herdr 소켓에 대한 접근 권한.
- Mermaid 미리보기를 사용할 경우 로컬 Node.js.
- 원격 편집을 사용할 경우 원격 POSIX 서버의 Python 3와 SSH/SCP 환경.

사용자 지정 설정 폴더는 `HERDR_APP_HOME`으로 지정할 수 있다. 실행 중인 Herdr와 같은 경로를 사용해야 한다.

```sh
HERDR_APP_HOME="/path/to/herdr-config" python3 ./install-herdr-workspace-macos.py
```

현재 스크립트는 실행할 때마다 기본 브랜치의 최신 커밋을 설치한다. 이 기록의 커밋으로 고정하는 옵션은 없으므로, 재실행 시 설치 버전이 달라질 수 있다. 재설치하면 해당 두 모드 폴더의 사용자 수정 사항은 교체되며, 기존 내용은 백업에 보관된다.

## 실제 발생한 문제와 해결

### GitHub 다운로드 실패

초기 제한된 세션에서는 다음 오류로 clone에 실패했다.

```text
fatal: unable to access 'https://github.com/li-fo/herdr-files-workspace.git/': Could not resolve host: github.com
```

GitHub 커넥터로 README와 소스 일부를 확인하는 것은 가능했지만, 로컬 Git 프로세스의 네트워크 접근은 제한되어 있었다. 이 오류만으로 사용자 컴퓨터의 DNS 자체가 고장 났다고 판단하지 않았다.

사용자가 세션 권한을 변경한 뒤 확장 권한으로 설치 스크립트를 실행하자 clone이 성공했다. 시스템 DNS 설정 변경이나 저장소 URL 변경은 하지 않았다.

### 실행 중인 Herdr 소켓 접근 실패

초기 `herdr-app status`와 설치 스크립트 실행에서 다음 오류가 발생했다.

```text
herdr-app: no Herdr window at /Users/young/.config/herdr-app/herdr-app.sock: Operation not permitted (os error 1)
```

실제 설정 폴더와 소켓은 존재했다. 메시지에 `no Herdr window`가 포함되어 있어도, 이 경우 직접적인 실패 원인은 `Operation not permitted`였다. Herdr가 꺼져 있다고 단정할 상황은 아니었다.

사용자가 권한을 변경한 뒤 확장 권한으로 다시 실행했고, 같은 소켓을 통해 상태 조회와 레이아웃 전환이 성공했다. 소켓 삭제, 앱 재설치, `chmod 777`은 하지 않았다.

### 설정 폴더 쓰기 제한

초기 세션에서 쓰기 가능한 폴더는 작업 폴더와 임시 폴더로 제한되어 있었다. 실제 설치 대상인 `~/.config/herdr-app`은 범위 밖이어서 설치 스크립트를 작업 폴더에 먼저 준비했다.

이후 사용자의 권한 변경과 확장 권한 실행으로 실제 설정 폴더 설치가 가능해졌다. 설치를 위해 `sudo`나 시스템 전체 권한 변경을 사용하지 않았다.

### Windows용 설치 안내와 macOS의 차이

Windows 설치 프로그램을 그대로 실행하지 않고, 두 모드 설치·단축키 병합·레이아웃 연결·백업·검사를 Python으로 구현했다. 모드 안의 macOS 실행 경로를 유지했으며, PowerShell 설치나 Windows 명령으로의 강제 변환은 하지 않았다.

## 확인된 실행 결과

설치 전 소스와 설치 후 파일 각각에서 두 모드의 검사가 통과했다.

```text
check passed: .../source/mods/files-workspace
check passed: .../source/mods/files-workspace-header
check passed: /Users/young/.config/herdr-app/mods/files-workspace
check passed: /Users/young/.config/herdr-app/mods/files-workspace-header
```

레이아웃 전환은 `{"ok": true}`를 반환했고, 이후 상태에 다음 값이 표시되었다.

```json
{
  "layout": "files-workspace",
  "errors": []
}
```

화면 캡처에서도 Files 패널, 아이콘, 폴더와 파일 목록이 표시되는 것을 확인했다. 이후 사용자가 Markdown 미리보기, 로컬 파일 전송·삭제, 서버 접속 후 파일 전송·삭제의 정상 동작을 보고했다. 테스트 파일, 전송 방향별 결과와 세부 OS 버전은 별도로 기록하지 않았다.

`herdr-app check`는 초기 로드와 렌더링 검사다. 모든 비동기 상태, 사용자 조작, 원격 작업을 검증하는 통합 테스트는 아니다.

## SSH는 어떤 구현을 사용하는가?

이번 설치는 지정한 저장소의 모드 코드를 그대로 복사했다. 따라서 SSH도 설치 커밋의 구현을 그대로 사용하며, macOS용으로 별도의 SSH 로직을 추가하지 않았다.

여기서 “원본”은 이번에 지정한 `li-fo/herdr-files-workspace`의 소스를 뜻한다. 이 프로젝트의 이전 원형인 Files Transfer와 모든 코드가 동일하다는 뜻은 아니다. 현재 설치본은 기존 원격 명령 경로와 이 저장소에 추가된 원격 편집 기능을 함께 사용한다.

| 작업 | 현재 소스의 실행 경로 |
| --- | --- |
| 원격 폴더 목록·파일 조작 | Herdr `exec(command, args, { on: machine })`를 통한 원격 머신 실행 |
| SSH 대상 주소 확인 | `hc machine ls --json`에서 머신 이름에 해당하는 `target` 조회 |
| 파일 업로드·다운로드 | 로컬 `scp`와 위에서 조회한 SSH 대상 주소 사용 |
| 원격 텍스트 읽기 | 원격 `python3` 작업을 Herdr의 머신 실행 경로로 실행 |
| 원격 텍스트 저장 | 로컬 임시 파일 생성 → SCP로 원격 임시 위치에 전송 → 원격 Python으로 버전 확인 및 저장 |

`windows.js`는 원격 실행인 `options.on`이 있으면 Windows 변환을 우회한다. macOS에서는 로컬 실행도 기본 Herdr `exec`를 사용한다.

SCP 호출에는 `BatchMode=yes`, `ConnectTimeout=15`가 사용된다. 암호나 인증 확인 프롬프트에 의존하지 않는 SSH 구성이 필요하다. 암호가 있는 키도 SSH agent를 통해 이미 사용 가능하다면 이용할 수 있다. Herdr에서 원격 터미널이 열린다는 사실만으로 별도 로컬 SCP 호출까지 성공한다고 단정할 수는 없다.

확인에 사용할 수 있는 명령은 다음과 같다. `서버별칭`은 실제 등록된 SSH 대상 주소나 SSH config 별칭으로 바꾼다.

```sh
hc machine ls --json
ssh -o BatchMode=yes -o ConnectTimeout=15 서버별칭 'python3 --version'
```

원격 대상은 POSIX 환경을 전제로 한다. 원격 Windows 호스트는 이 기록의 검증 범위에 포함되지 않는다. 원격 삭제는 휴지통 이동이 아닌 영구 삭제 경로를 사용하므로 실제 자료가 아닌 임시 파일로 테스트한다. 최초 설치 과정에서는 원격 작업을 수행하지 않았으며, 이후 사용자가 서버 접속 후 파일 전송·삭제를 확인했다.

## 후속 테스트 항목

| 기능 | 확인할 내용 | 현재 기록 |
| --- | --- | --- |
| 모드 로드 | 두 모드 검사 및 오류 목록 | 통과 |
| Files 표시 | 파일 트리·아이콘·목록 표시 | 화면 확인 |
| 기본 작업 | 일반 사용 | 사용자 보고: 큰 문제 없음 |
| 로컬 편집·저장 | 한글, Cmd+S, 재열기, 외부 변경 충돌 | 개별 검증 기록 없음 |
| 찾기·바꾸기 | Cmd+F, Cmd+Option+F, 저장 반영 | 개별 검증 기록 없음 |
| Markdown | 미리보기 | 사용자 정상 동작 확인 |
| Mermaid | Node.js 렌더링, 확대·이동 | 개별 검증 기록 없음 |
| 로컬 전송·삭제 | 파일 전송과 삭제 | 사용자 정상 동작 확인 |
| 기타 파일 조작 | 생성·이름 변경 | 개별 검증 기록 없음 |
| 원격 접속·전송·삭제 | 서버 접속 후 파일 전송과 삭제 | 사용자 정상 동작 확인; 전송 방향별 기록 없음 |
| 원격 편집 | 읽기·수정·저장과 충돌 처리 | 미검증 |
| 재시작 | 설치 유지·레이아웃·단축키 복원 | 미검증 |

## 복구 및 설치 제거

### 기본 화면으로 전환

모드를 삭제하지 않고 원래 레이아웃으로 돌아갈 수 있다.

```sh
herdr-app do layout.switch --name main
```

### 설치 실패 시 자동 복구 범위

백업 후 모드 복사·설치된 모드 검사·단축키 및 레이아웃 저장 단계에서 오류가 나면 스크립트는 대상 파일과 폴더를 백업 상태로 되돌리도록 작성되어 있다. 이 실패 경로를 실제로 유발해 복구를 검증하지는 않았다.

마지막 레이아웃 활성화와 상태 확인은 자동 복구 블록 밖에 있다. 이 단계에서 실패하면 파일은 이미 설치되어 있을 수 있다. Herdr 상태를 확인하고 다음 명령으로 활성화할 수 있다.

```sh
herdr-app do layout.switch --name files-workspace
herdr-app status
```

### 이번 설치의 백업 내용

백업의 `manifest.json`에 따르면 이번 설치 이전에 존재한 대상은 `keys.json`뿐이었다. 두 사용자 모드 폴더와 `layouts/files-workspace.json`은 이번에 새로 추가되었다.

완전히 되돌릴 때에는 먼저 `main`으로 전환한 후 새로 추가한 두 모드 폴더와 해당 레이아웃 파일을 제거하고 단축키 변경을 복구한다. 설치 후 다른 단축키를 변경했다면 백업 `keys.json` 전체를 덮어쓰지 말고 현재 파일의 `mod:files-workspace` 섹션만 검토해 제거해야 이후 변경을 보존할 수 있다.

`data/files-workspace`의 임시 데이터와 Herdr 공유 상태는 설치 백업 대상에 포함되지 않는다. 편집 복구 초안이 들어 있을 수 있으므로 제거 전 보존할 자료가 있는지 확인한다.

## 현재 설치 스크립트의 한계

- Herdr 버전은 이번에 수동 확인했으며, 스크립트 자체에는 최소 버전 비교 로직이 없다.
- 기본 브랜치 최신 버전을 내려받으므로 커밋 고정 설치가 아니다.
- 전체 시스템이나 Herdr 상태 백업이 아니라 네 개 설치 대상에 한정된 백업이다.
- 실행 중인 앱의 hot reload를 일시 중단하거나 설치 전체를 하나의 원자적 작업으로 수행하지 않는다.
- 실제 파일 편집·원격 전송·렌더링 테스트를 자동 수행하지 않는다.
- 기본 `main.json`의 구조를 복사하지만 Herdr의 `layout.clone` 명령을 호출하거나 별도 미리보기 이미지를 만들지는 않는다.

## 참고 자료

- [프로젝트 README](https://github.com/li-fo/herdr-files-workspace/blob/e2f3339feb262deeb8f76ffd29849b39d838d8b8/README.md)
- [Windows 설치 및 동작 안내](https://github.com/li-fo/herdr-files-workspace/blob/e2f3339feb262deeb8f76ffd29849b39d838d8b8/WINDOWS.md)
- [Windows 설치 프로그램](https://github.com/li-fo/herdr-files-workspace/blob/e2f3339feb262deeb8f76ffd29849b39d838d8b8/install-windows.ps1)
- [플랫폼 분기](https://github.com/li-fo/herdr-files-workspace/blob/e2f3339feb262deeb8f76ffd29849b39d838d8b8/mods/files-workspace/windows.js)
- [파일 조작 및 SSH 대상 조회](https://github.com/li-fo/herdr-files-workspace/blob/e2f3339feb262deeb8f76ffd29849b39d838d8b8/mods/files-workspace/file-operations.js)
- [원격 텍스트 편집](https://github.com/li-fo/herdr-files-workspace/blob/e2f3339feb262deeb8f76ffd29849b39d838d8b8/mods/files-workspace/remote-text.js)
