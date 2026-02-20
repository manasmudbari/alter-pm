# alter

A PM2-like process manager built in Rust. Manages any runtime — Python, Go, Rust, .NET, Node.js, and more.

See [excluded/docs/README.md](excluded/docs/README.md) for full documentation.

## Build

```bash
cargo build --release
```

## Quick start

```bash
alter daemon start
alter start python -- -m http.server 8080
alter list
alter logs python
alter web   # open dashboard at http://127.0.0.1:2999/
```
