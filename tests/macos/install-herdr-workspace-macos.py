#!/usr/bin/env python3
"""Install the unmodified Files Workspace mods for experimental macOS testing."""
import datetime
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile


def run(*args):
    subprocess.run(args, check=True)


def write_json(path, value):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


def main():
    app = Path(os.environ.get('HERDR_APP_HOME', Path.home() / '.config/herdr-app')).resolve()
    executable = shutil.which('herdr-app')
    if not executable:
        raise SystemExit('herdr-app is not on PATH.')
    if not (app / 'layouts/main.json').is_file():
        raise SystemExit('Start Herdr once before installing.')
    os.environ['HERDR_APP_HOME'] = str(app)
    # Confirm that activation is possible before downloading or changing files.
    run(executable, 'status')
    names = ('files-workspace', 'files-workspace-header')
    layout_path = app / 'layouts/files-workspace.json'
    keys_path = app / 'keys.json'
    layout = json.loads((layout_path if layout_path.exists() else app / 'layouts/main.json').read_text())
    keys = json.loads(keys_path.read_text())
    bindings = {
        'ctrl-s': 'save', 'cmd-s': 'save',
        'ctrl-f': 'find', 'cmd-f': 'find',
        'ctrl-h': 'replace', 'cmd-alt-f': 'replace',
    }
    section = keys.setdefault('mod:files-workspace', {})
    for key, action in bindings.items():
        command = 'files-workspace.' + action
        if key in section and section[key] != command:
            raise SystemExit('Conflicting shortcut: ' + key)
        section[key] = command
    counts = [0, 0]

    def connect(node):
        content = node.get('content', {})
        if content.get('mod') in ('files', 'files-workspace'):
            content['mod'] = 'files-workspace'
            counts[0] += 1
        header = content.get('pane', {}).get('header', {}).get('content', {})
        if header.get('mod') in ('pane', 'files-workspace-header'):
            header['mod'] = 'files-workspace-header'
            counts[1] += 1
        for child in node.get('children', []):
            connect(child)

    connect(layout)
    if not all(counts):
        raise SystemExit('The layout needs a Files block and pane header. No files changed.')
    if layout.get('colors', {}).get('selection') == '#6699cc55':
        del layout['colors']['selection']
    with tempfile.TemporaryDirectory(prefix='herdr-workspace-') as temporary:
        source = Path(temporary) / 'source'
        run('git', 'clone', '--depth', '1', 'https://github.com/li-fo/herdr-files-workspace.git', str(source))
        for name in names:
            run(executable, 'check', str(source / 'mods' / name))
        revision = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
        stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')
        backup = app / 'backups' / ('files-workspace-macos-' + stamp)
        targets = [Path('mods') / name for name in names] + [Path('keys.json'), Path('layouts/files-workspace.json')]
        backup.mkdir(parents=True)
        existed = []
        for relative in targets:
            target = app / relative
            if target.is_symlink():
                raise SystemExit('Refusing to replace a symbolic link: ' + str(target))
            if target.exists():
                saved = backup / relative
                saved.parent.mkdir(parents=True, exist_ok=True)
                if target.is_dir():
                    shutil.copytree(target, saved)
                else:
                    shutil.copy2(target, saved)
                existed.append(str(relative))
        write_json(backup / 'manifest.json', {'revision': revision, 'previously_existed': existed, 'targets': [str(p) for p in targets]})
        try:
            for name in names:
                destination = app / 'mods' / name
                if destination.exists():
                    shutil.rmtree(destination)
                shutil.copytree(source / 'mods' / name, destination)
            for name in names:
                run(executable, 'check', str(app / 'mods' / name))
            write_json(keys_path, keys)
            write_json(layout_path, layout)
        except BaseException:
            for relative in targets:
                target = app / relative
                if target.is_dir():
                    shutil.rmtree(target)
                elif target.exists():
                    target.unlink()
                saved = backup / relative
                if saved.is_dir():
                    shutil.copytree(saved, target)
                elif saved.exists():
                    shutil.copy2(saved, target)
            print('Installation failed; previous files restored. Backup:', backup)
            raise
        print('Installed revision:', revision)
        print('Backup:', backup)
        print('Return to the original layout: herdr-app do layout.switch --name main')
        run(executable, 'do', 'layout.switch', '--name', 'files-workspace')
        run(executable, 'status')
        print('Open Files, then test opening, editing, saving and previewing a disposable file.')


if __name__ == '__main__':
    main()
